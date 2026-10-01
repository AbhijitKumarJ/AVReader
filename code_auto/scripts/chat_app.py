#!/usr/bin/env python3
"""Local chat + wizard for the automated reader pipeline (aiohttp).

    python3 scripts/chat_app.py        # http://127.0.0.1:8787  (CHAT_PORT)

Routes:
    GET  /                    chat UI (chat/static/index.html)
    GET  /static/*            UI assets
    GET  /reader[/{tail}]     live preview of final/assets (the assembled app)
    GET  /api/state           workspace summary + wizard view
    POST /api/wizard          {question, value} | {action: "reset"}
    POST /api/blog            {text} -> writes input/blog.txt
    POST /api/draft-ingest    {text} -> parse draft JSON from a chat reply
    GET  /api/run?action=X&force=0   chunked pipeline log stream
    POST /api/chat            {message} -> chunked assistant stream
    GET  /api/history         chat messages (persisted in draft/chat_history.json)
    DELETE /api/history       clear the chat
    POST /api/ingest          {text} -> pull fenced JS blocks into draft/assets/js/

The system prompt is scripts/sys_prompt.md (shared with AI Studio mode) plus
a workspace-state appendix.  Generation never starts without an explicit
confirmation from the UI (wizard buttons).
"""

import asyncio
import json
import os
import sys

from aiohttp import web

import llm
import pipeline

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(SCRIPT_DIR, 'chat', 'static')

HOST = os.environ.get('CHAT_HOST') or '127.0.0.1'
PORT = int(os.environ.get('CHAT_PORT') or '8787')

JOB = asyncio.Lock()          # one pipeline/chat job at a time


# --------------------------------------------------------------------- state

def wizard_view():
    """Current wizard question / phase, derived from answers + disk state."""
    state = pipeline.load_state()
    summary = pipeline.state_summary()
    answers = state['answers']
    draft_ok = summary['draft']['valid']
    missing = summary['missingCount']

    view = {'answers': answers, 'draft': summary['draft'],
            'totals': summary['totals'], 'missing': summary['missing'],
            'missingCount': missing, 'assembled': summary['assembled'],
            'blog': summary['blog'], 'models': summary['models'],
            'sections': summary['sections'], 'warnings': summary['warnings']}

    if answers['draft'] is None:
        view.update(phase='q_draft',
                    question='Do you already have a draft.json from a previous '
                             'session?')
    elif answers['draft'] and not draft_ok:
        view.update(phase='draft_fix',
                    question='You said you have a draft, but draft/draft.json '
                             'is missing or invalid. Paste it in the chat (or '
                             'give me the blog and I will recreate it).')
    elif not answers['draft'] and not draft_ok:
        view.update(phase='blog',
                    question='Paste your blog below (it is saved as '
                             'input/blog.txt), then create the draft.')
    elif answers['images'] is None:
        view.update(phase='q_images',
                    question='Have you already created the image assets for '
                             'the static sections?')
    elif answers['audio'] is None:
        view.update(phase='q_audio',
                    question='Have you already created the audio segment '
                             'files (one WAV per section)?')
    elif answers['js'] is None:
        view.update(phase='q_js',
                    question='Have you already created the JavaScript assets '
                             'for the dynamic sections?')
    elif missing > 0:
        view.update(phase='gap',
                    question=f'{missing} asset(s) the draft needs are missing '
                             f'from draft/assets/. Generate them now?')
    elif not summary['assembled']:
        view.update(phase='assemble',
                    question='All assets are present. Assemble the reader '
                             '(master audio + timeline + frontend)?')
    else:
        view.update(phase='done',
                    question='The reader is assembled. Open it to verify '
                             '(/reader/), keep giving instructions in the '
                             'chat, or finish and archive to out/<n>?')
    return view


def state_payload():
    payload = pipeline.state_summary()
    payload['wizard'] = wizard_view()
    return payload


def default_state():
    return {'step': 'start',
            'answers': {'draft': None, 'images': None, 'audio': None, 'js': None},
            'blog_pasted': False,
            'assembled': False,
            'archived': False,
            'generated': {}}


def apply_result(action, result, state):
    """Update wizard state after a successful pipeline action."""
    if action == 'create_draft':
        state['answers']['draft'] = True
    elif action == 'ensure_images' and isinstance(result, dict) \
            and result.get('failed') == 0:
        state['answers']['images'] = True
    elif action == 'ensure_audio' and isinstance(result, dict) \
            and result.get('failed') == 0:
        state['answers']['audio'] = True
    elif action == 'ensure_js' and isinstance(result, dict) \
            and result.get('failed') == 0:
        state['answers']['js'] = True
    elif action == 'archive':
        state = default_state()
    return state


# ---------------------------------------------------------------- streaming

async def stream_from_worker(target, write_queue_item):
    """Run a producer in a thread, forward items to the HTTP response.

    target(log) runs in a worker thread; it must push str lines (or ('result',
    obj) / ('error', str)) into the queue via the loop-safe wrapper.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    box = {}

    def push(item):
        loop.call_soon_threadsafe(queue.put_nowait, item)

    def worker():
        def log(message=''):
            push(('log', f'{message}\n'))
        try:
            box['result'] = target(log)
            push(('done', None))
        except (pipeline.PipelineError, llm.LLMError, OSError, ValueError) as e:
            box['error'] = str(e)
            push(('log', f'ERROR: {e}\n'))
            push(('done', None))
        except Exception as e:                       # noqa: BLE001
            box['error'] = f'{type(e).__name__}: {e}'
            push(('log', f'ERROR: {type(e).__name__}: {e}\n'))
            push(('done', None))

    loop.run_in_executor(None, worker)
    return queue, box


async def pump_logs(response, queue):
    await response.write(b'')
    while True:
        kind, item = await queue.get()
        if kind == 'done':
            break
        if kind == 'log':
            await response.write(item.encode('utf-8', 'replace'))


async def pump_chat(response, queue):
    while True:
        kind, item = await queue.get()
        if kind == 'done':
            break
        if kind == 'log':
            await response.write(item.encode('utf-8', 'replace'))


# ------------------------------------------------------------------ handlers

async def handle_state(request):
    return web.json_response(state_payload())


async def handle_wizard(request):
    body = await request.json()
    state = pipeline.load_state()
    action = body.get('action')

    if action == 'reset':
        state = default_state()
        pipeline.save_state(state)
        return web.json_response(state_payload())

    question = body.get('question')
    value = body.get('value')
    valid = {'draft', 'images', 'audio', 'js'}
    if question not in valid or not isinstance(value, bool):
        return web.json_response({'error': 'bad wizard answer'}, status=400)
    state['answers'][question] = value
    pipeline.save_state(state)
    return web.json_response(state_payload())


async def handle_blog(request):
    body = await request.json()
    text = (body.get('text') or '').strip()
    if not text:
        return web.json_response({'error': 'empty blog text'}, status=400)
    pipeline.prepare_folders()
    with open(os.path.join(pipeline.INPUT_DIR, pipeline.BLOG_NAME), 'w',
              encoding='utf-8') as f:
        f.write(text.rstrip() + '\n')
    state = pipeline.load_state()
    state['blog_pasted'] = True
    pipeline.save_state(state)
    return web.json_response(state_payload())


async def handle_draft_ingest(request):
    """Save a draft-v1 JSON found in a chat reply."""
    body = await request.json()
    text = body.get('text') or ''
    try:
        draft = llm.extract_json(text)
        draft = pipeline.normalize_draft(draft)
        errors, warnings = pipeline.validate_draft(draft)
        if errors:
            return web.json_response({'errors': errors}, status=422)
        pipeline.save_draft(draft)
    except (llm.LLMError, pipeline.PipelineError) as e:
        return web.json_response({'errors': [str(e)]}, status=422)
    state = pipeline.load_state()
    state['answers'].setdefault('draft', True)
    state['answers']['draft'] = True
    pipeline.save_state(state)
    return web.json_response({'saved': pipeline.DRAFT_FILE,
                              'warnings': warnings,
                              'state': state_payload()})


async def handle_run(request):
    action = request.query.get('action', '')
    force = request.query.get('force', '0') in ('1', 'true', 'yes')
    if action not in pipeline.ACTIONS:
        return web.json_response({'error': f'unknown action {action!r}'},
                                 status=400)
    if JOB.locked():
        return web.json_response({'error': 'another job is running'},
                                 status=409)

    async with JOB:
        state = pipeline.load_state()
        queue, box = await stream_from_worker(
            lambda log: pipeline.run_action(action, force=force, log=log),
            None)
        response = web.StreamResponse(
            headers={'Content-Type': 'text/plain; charset=utf-8',
                     'Cache-Control': 'no-cache'})
        await response.prepare(request)
        try:
            await pump_logs(response, queue)
        finally:
            if 'result' in box and 'error' not in box:
                state = apply_result(action, box['result'], state)
                pipeline.save_state(state)
        await response.write_eof()
        return response


async def handle_chat(request):
    body = await request.json()
    message = (body.get('message') or '').strip()
    if not message:
        return web.json_response({'error': 'empty message'}, status=400)
    if JOB.locked():
        return web.json_response({'error': 'another job is running'},
                                 status=409)

    system = pipeline.sys_prompt() + '\n\n' + pipeline.state_appendix()
    history = load_history()
    turns = [{'role': m['role'], 'content': m['content']} for m in history[-16:]]
    turns.append({'role': 'user', 'content': message})

    async with JOB:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        box = {}
        collected = []

        def push(item):
            loop.call_soon_threadsafe(queue.put_nowait, item)

        def worker():
            try:
                parts = []
                for chunk in llm.stream_text(message, system=system,
                                             temperature=0.7):
                    parts.append(chunk)
                    push(('log', chunk))
                box['text'] = ''.join(parts)
                push(('done', None))
            except (llm.LLMError, pipeline.PipelineError) as e:
                box['error'] = str(e)
                push(('log', f'\n[error: {e}]'))
                push(('done', None))
            except Exception as e:                   # noqa: BLE001
                box['error'] = f'{type(e).__name__}: {e}'
                push(('log', f'\n[error: {type(e).__name__}: {e}]'))
                push(('done', None))

        loop.run_in_executor(None, worker)
        response = web.StreamResponse(
            headers={'Content-Type': 'text/plain; charset=utf-8',
                     'Cache-Control': 'no-cache'})
        await response.prepare(request)
        await pump_chat(response, queue)
        await response.write_eof()

        # persist after the stream completes
        if box.get('text'):
            history.append({'role': 'user', 'content': message})
            history.append({'role': 'assistant', 'content': box['text']})
            save_history(history[-60:])
        return response


async def handle_history(request):
    return web.json_response({'messages': load_history()})


async def handle_history_clear(request):
    save_history([])
    return web.json_response({'messages': []})


async def handle_ingest(request):
    body = await request.json()
    text = body.get('text') or ''
    try:
        pipeline.prepare_folders()
        result = pipeline.ingest_js(text)
    except pipeline.PipelineError as e:
        return web.json_response({'error': str(e)}, status=422)
    return web.json_response({'result': result, 'state': state_payload()})


def load_history():
    if os.path.isfile(pipeline.HISTORY_FILE):
        try:
            with open(pipeline.HISTORY_FILE, encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
        except ValueError:
            pass
    return []


def save_history(history):
    os.makedirs(pipeline.DRAFT_DIR, exist_ok=True)
    with open(pipeline.HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


# --------------------------------------------------------------- static routes

async def handle_reader(request):
    """Serve the assembled reader from final/assets at /reader/."""
    tail = request.match_info.get('tail', '').lstrip('/')
    base = os.path.abspath(pipeline.FINAL_ASSETS)
    if not os.path.isdir(base):
        raise web.HTTPNotFound(text='final/assets not assembled yet')
    path = os.path.abspath(os.path.join(base, tail or 'index.html'))
    if not path.startswith(base + os.sep) and path != base:
        raise web.HTTPForbidden()
    if not os.path.isfile(path):
        raise web.HTTPNotFound()
    return web.FileResponse(path)


async def handle_index(request):
    return web.FileResponse(os.path.join(STATIC_DIR, 'index.html'))


def build_app():
    pipeline.prepare_folders()
    app = web.Application()
    app.add_routes([
        web.get('/', handle_index),
        web.static('/static', STATIC_DIR),
        web.get('/reader', handle_reader),
        web.get('/reader/{tail:.*}', handle_reader),
        web.get('/api/state', handle_state),
        web.post('/api/wizard', handle_wizard),
        web.post('/api/blog', handle_blog),
        web.post('/api/draft-ingest', handle_draft_ingest),
        web.get('/api/run', handle_run),
        web.post('/api/chat', handle_chat),
        web.get('/api/history', handle_history),
        web.delete('/api/history', handle_history_clear),
        web.post('/api/ingest', handle_ingest),
    ])
    return app


def main():
    print(f'Audio-Visual Reader chat  ->  http://{HOST}:{PORT}')
    print(f'  providers: {llm.describe_providers()}')
    print(f'  reader:    http://{HOST}:{PORT}/reader/  (after assembly)')
    web.run_app(build_app(), host=HOST, port=PORT, print=None)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
