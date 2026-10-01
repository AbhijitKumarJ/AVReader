#!/usr/bin/env python3
"""Gemini / OpenRouter client for the automated pipeline (read-only .env usage).

Providers (configured in .env, never modified by the scripts):

    PROVIDER=google|openrouter     primary provider        (default: google)
    FALLBACK_PROVIDER=google|openrouter|none
                                   provider tried when the primary fails
                                   (default: the other one, when its key exists)
    GEMINI_API_KEY                 Google Generative Language key
    OPEN_ROUTER_API_KEY            OpenRouter key

    LLM_MODEL / IMAGE_MODEL / AUDIO_MODEL                Google model names
    OPEN_ROUTER_LLM_MODEL / _IMAGE_MODEL / _AUDIO_MODEL  OpenRouter model ids

    LLM_MODEL_FALLBACKS=a,b   extra Google text models to try (default:
                               3.5-flash, 3.1-flash-lite, flash-latest)
    LLM_MODEL_FALLBACKS=none  disable them

API surface (same for both providers, auto-dispatched):
    generate_text / stream_text   text drafting, JS, chat
    generate_image                static section images
    tts                           section narration -> (pcm, rate)

Calls have a timeout, retry 429/5xx with backoff, and fall back from the
primary provider to the fallback provider on 429/4xx-model/5xx/network.
"""

import base64
import json
import os
import re
import time
import urllib.error
import urllib.request

from envfile import load_env

load_env()

API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

DEFAULTS = {
    'llm': 'gemini-3.8-flash',
    'image': 'gemini-3.1-flash-lite-image',
    'audio': 'gemini-3.8-flash-lite-tts',
    'voice': 'Kore',
}
OPENROUTER_DEFAULTS = {
    'llm': 'google/gemini-3.8-flash',
    'image': 'google/gemini-3.1-flash-lite-image',
    'audio': 'google/gemini-3.8-flash-lite-tts',
}
DEFAULT_TEXT_FALLBACKS = ('gemini-3.5-flash', 'gemini-3.1-flash-lite',
                          'gemini-flash-latest')

GOOGLE, OPENROUTER = 'google', 'openrouter'

last_model = None     # 'provider:model' of the most recent successful text call


class LLMError(RuntimeError):
    """A provider call failed after retries.

    ``code`` carries the HTTP status when one was received (None = network).
    """

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


# ------------------------------------------------------------- provider setup

def google_key():
    return os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')


def openrouter_key():
    return (os.environ.get('OPEN_ROUTER_API_KEY')
            or os.environ.get('OPENROUTER_API_KEY'))


def google_available():
    return bool(google_key())


def openrouter_available():
    return bool(openrouter_key())


def primary_provider():
    value = (os.environ.get('PROVIDER') or GOOGLE).strip().lower()
    if value in ('openrouter', 'or'):
        return OPENROUTER
    return GOOGLE                     # google and auto both start with Google


def fallback_provider():
    explicit = os.environ.get('FALLBACK_PROVIDER')
    if explicit is None:
        other = OPENROUTER if primary_provider() == GOOGLE else GOOGLE
        return other
    value = explicit.strip().lower()
    if value in ('', 'none', 'off', 'false'):
        return None
    if value in ('openrouter', 'or'):
        return OPENROUTER
    if value == 'auto':
        return OPENROUTER if primary_provider() == GOOGLE else GOOGLE
    return GOOGLE


def provider_chain():
    """Providers to try, in order, restricted to those with keys present."""
    chain = []
    for provider in (primary_provider(), fallback_provider()):
        if provider and provider not in chain:
            available = (google_available() if provider == GOOGLE
                         else openrouter_available())
            if available:
                chain.append(provider)
    if not chain:
        raise LLMError('No API key configured: set GEMINI_API_KEY and/or '
                       'OPEN_ROUTER_API_KEY in .env (see .env.sample)')
    return chain


def google_model(kind):
    env_key = {'llm': 'LLM_MODEL', 'image': 'IMAGE_MODEL',
               'audio': 'AUDIO_MODEL'}[kind]
    return os.environ.get(env_key) or DEFAULTS[kind]


def openrouter_model(kind):
    env_key = {'llm': 'OPEN_ROUTER_LLM_MODEL', 'image': 'OPEN_ROUTER_IMAGE_MODEL',
               'audio': 'OPEN_ROUTER_AUDIO_MODEL'}[kind]
    return os.environ.get(env_key) or OPENROUTER_DEFAULTS[kind]


def model_for(kind):
    """Model used by the primary available provider (for display/defaults)."""
    try:
        provider = provider_chain()[0]
    except LLMError:
        return google_model(kind)
    return openrouter_model(kind) if provider == OPENROUTER else google_model(kind)


def api_key():
    """Google API key (kept for backwards compatibility)."""
    key = google_key()
    if not key:
        raise LLMError('Missing API key: set GEMINI_API_KEY=... in .env '
                       '(see .env.sample)')
    return key


def describe_providers():
    """One-line provider setup summary for logs / state endpoints."""
    chain = provider_chain()
    primary = chain[0]
    model = openrouter_model('llm') if primary == OPENROUTER else google_model('llm')
    text = f'{primary}:{model}'
    if len(chain) > 1:
        fallback = chain[1]
        fb_model = (openrouter_model('llm') if fallback == OPENROUTER
                    else google_model('llm'))
        text += f' (fallback {fallback}:{fb_model})'
    else:
        text += ' (no fallback)'
    return text


def _model_candidates(kind, model=None):
    """[(provider, model)] to try for a call, in order.

    primary provider -> the other provider (if its key exists) -> extra
    Google text models (LLM_MODEL_FALLBACKS, text calls only).
    """
    if model:
        # explicit name: no slash = Google model id, slash = OpenRouter id
        if '/' in model:
            return [(OPENROUTER, model)] if openrouter_available() else []
        return [(GOOGLE, model)] if google_available() else []
    chain = provider_chain()
    candidates = []
    for provider in chain:
        name = openrouter_model(kind) if provider == OPENROUTER else google_model(kind)
        candidates.append((provider, name))
    if kind == 'llm' and google_available():
        configured = os.environ.get('LLM_MODEL_FALLBACKS')
        if configured is None:
            extras = list(DEFAULT_TEXT_FALLBACKS)
        elif configured.strip().lower() in ('none', 'off', ''):
            extras = []
        else:
            extras = [p.strip() for p in configured.split(',') if p.strip()]
        for name in extras:
            if (GOOGLE, name) not in candidates:
                candidates.append((GOOGLE, name))
    return candidates


# ------------------------------------------------------------------ transports

def _post_json(url, payload, headers, timeout, retries=4):
    last = None
    for attempt in range(retries):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:800]
            last = LLMError(f'HTTP {e.code} from {url}: {body}', code=e.code)
            if e.code in (400, 401, 402, 403, 404):
                raise last          # bad payload/key/credits/model: next candidate
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(2 ** attempt, 15))
                continue
            raise last
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = LLMError(f'network error calling {url}: {e}', code=None)
            time.sleep(min(2 ** attempt, 15))
    raise last if last else LLMError('unknown error')


def _google_headers():
    key = google_key()
    if not key:
        raise LLMError('Missing API key: set GEMINI_API_KEY=... in .env '
                       '(see .env.sample)')
    return {'Content-Type': 'application/json', 'x-goog-api-key': key}


def _openrouter_headers():
    key = openrouter_key()
    if not key:
        raise LLMError('Missing API key: set OPEN_ROUTER_API_KEY=... in .env '
                       '(see .env.sample)')
    return {'Content-Type': 'application/json', 'Authorization': f'Bearer {key}',
            'X-Title': 'avreader'}


def _parts_text(body):
    try:
        parts = body['candidates'][0]['content']['parts']
    except (KeyError, IndexError, TypeError):
        raise LLMError(f'unexpected text response: {json.dumps(body)[:400]}')
    return ''.join(p.get('text', '') for p in parts if isinstance(p, dict))


def _inline_data(body):
    """First inline payload (bytes, mime) in a Google generateContent response."""
    try:
        parts = body['candidates'][0]['content']['parts']
    except (KeyError, IndexError, TypeError):
        raise LLMError(f'unexpected response: {json.dumps(body)[:400]}')
    for part in parts:
        if not isinstance(part, dict):
            continue
        inline = part.get('inlineData') or part.get('inline_data')
        if inline and inline.get('data'):
            mime = inline.get('mimeType') or inline.get('mime_type') or ''
            return base64.b64decode(inline['data']), mime
    raise LLMError(f'no inline data in response: {json.dumps(body)[:400]}')


def _set_last_model(provider, model):
    global last_model
    last_model = f'{provider}:{model}'


# ---------------------------------------------------------------- text (both)

def _text_payload(prompt, system, temperature):
    payload = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}]}
    if system:
        payload['systemInstruction'] = {'parts': [{'text': system}]}
    generation = {}
    if temperature is not None:
        generation['temperature'] = temperature
    if generation:
        payload['generationConfig'] = generation
    return payload


def _google_text(provider, model, prompt, system, temperature, timeout, retries):
    payload = _text_payload(prompt, system, temperature)
    body = _post_json(f'{API_BASE}/{model}:generateContent', payload,
                      _google_headers(), timeout, retries=retries)
    return _parts_text(body)


def _openrouter_messages(prompt, system):
    messages = []
    if system:
        messages.append({'role': 'system', 'content': system})
    messages.append({'role': 'user', 'content': prompt})
    return messages


def _openrouter_text(provider, model, prompt, system, temperature, timeout, retries):
    payload = {'model': model,
               'messages': _openrouter_messages(prompt, system)}
    if temperature is not None:
        payload['temperature'] = temperature
    body = _post_json(f'{OPENROUTER_BASE}/chat/completions', payload,
                      _openrouter_headers(), timeout, retries=retries)
    try:
        message = body['choices'][0]['message']
    except (KeyError, IndexError, TypeError):
        raise LLMError(f'unexpected OpenRouter response: '
                       f'{json.dumps(body)[:400]}')
    if message.get('refusal'):
        raise LLMError(f'model refused: {message["refusal"][:200]}')
    content = message.get('content')
    if isinstance(content, list):          # content-part array
        content = ''.join(p.get('text', '') for p in content
                          if isinstance(p, dict))
    if not content:
        raise LLMError(f'empty content in OpenRouter response: '
                       f'{json.dumps(body)[:400]}')
    return content


def generate_text(prompt, system=None, model=None, temperature=None,
                  timeout=180, retries=4, on_fallback=None):
    """Buffered text completion. Returns the raw text.

    Walks the provider chain (primary -> fallback) plus configured text
    model fallbacks on 429/4xx-model/5xx/network failures.
    """
    candidates = _model_candidates('llm', model)
    if not candidates:
        raise LLMError('no provider available for text generation '
                       '(check GEMINI_API_KEY / OPEN_ROUTER_API_KEY)')
    error = None
    for index, (provider, name) in enumerate(candidates):
        try:
            if provider == OPENROUTER:
                text = _openrouter_text(provider, name, prompt, system,
                                        temperature, timeout, retries)
            else:
                text = _google_text(provider, name, prompt, system,
                                    temperature, timeout, retries)
            _set_last_model(provider, name)
            return text
        except LLMError as e:
            error = e
            if index + 1 < len(candidates):
                nxt = candidates[index + 1]
                if on_fallback:
                    on_fallback(f'{provider}:{name}', f'{nxt[0]}:{nxt[1]}')
                continue
    raise error


def stream_text(prompt, system=None, model=None, temperature=None,
                timeout=180, retries=3, on_fallback=None):
    """Yield text deltas from the primary provider, with fallbacks."""
    candidates = _model_candidates('llm', model)
    if not candidates:
        raise LLMError('no provider available for streaming text')
    error = None
    for index, (provider, name) in enumerate(candidates):
        try:
            yielded = False
            if provider == OPENROUTER:
                deltas = _openrouter_stream(name, prompt, system, temperature,
                                            timeout, retries)
            else:
                deltas = _google_stream(name, prompt, system, temperature,
                                        timeout, retries)
            for delta in deltas:
                if not yielded:
                    _set_last_model(provider, name)
                    yielded = True
                yield delta
            if yielded:
                return
            raise LLMError(f'{provider}:{name}: empty stream', code=None)
        except LLMError as e:
            error = e
            if index + 1 < len(candidates):
                nxt = candidates[index + 1]
                if on_fallback:
                    on_fallback(f'{provider}:{name}', f'{nxt[0]}:{nxt[1]}')
                continue
    raise error


def _google_stream(model, prompt, system, temperature, timeout, retries):
    payload = _text_payload(prompt, system, temperature)
    url = f'{API_BASE}/{model}:streamGenerateContent?alt=sse'
    yield from _sse_lines(url, payload, _google_headers(), timeout, retries,
                          extract=lambda chunk: [
                              p.get('text', '')
                              for p in chunk['candidates'][0]['content']['parts']
                              if isinstance(p, dict) and p.get('text')])


def _openrouter_stream(model, prompt, system, temperature, timeout, retries):
    payload = {'model': model, 'stream': True,
               'messages': _openrouter_messages(prompt, system)}
    if temperature is not None:
        payload['temperature'] = temperature
    url = f'{OPENROUTER_BASE}/chat/completions'

    def extract(chunk):
        try:
            delta = chunk['choices'][0].get('delta') or {}
        except (KeyError, IndexError, TypeError):
            return []
        content = delta.get('content')
        return [content] if isinstance(content, str) and content else []

    yield from _sse_lines(url, payload, _openrouter_headers(), timeout, retries,
                          extract=extract)


def _sse_lines(url, payload, headers, timeout, retries, extract):
    last = None
    for attempt in range(retries):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                for raw in response:
                    line = raw.decode('utf-8', 'replace').strip()
                    if not line.startswith('data:'):
                        continue
                    data = line[5:].strip()
                    if data == '[DONE]':
                        return
                    try:
                        chunk = json.loads(data)
                    except ValueError:
                        continue
                    if chunk.get('error'):
                        raise LLMError(f'stream error: '
                                       f'{json.dumps(chunk["error"])[:300]}',
                                       code=None)
                    try:
                        for text in extract(chunk):
                            yield text
                    except (KeyError, IndexError, TypeError):
                        continue
            return
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:800]
            last = LLMError(f'HTTP {e.code} from {url}: {body}', code=e.code)
            if e.code in (400, 403, 401, 402):
                raise last
            time.sleep(min(2 ** attempt, 15))
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = LLMError(f'network error calling {url}: {e}', code=None)
            time.sleep(min(2 ** attempt, 15))
    raise last if last else LLMError('streaming failed')


# ------------------------------------------------------------ image (both)

def _google_image(model, prompt, aspect, timeout, retries):
    variants = []
    if aspect:
        variants.append({'responseModalities': ['IMAGE'],
                         'imageConfig': {'aspectRatio': aspect}})
    variants.append({'responseModalities': ['IMAGE']})
    variants.append({'responseModalities': ['TEXT', 'IMAGE']})
    error = None
    for generation in variants:
        payload = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                   'generationConfig': generation}
        try:
            body = _post_json(f'{API_BASE}/{model}:generateContent', payload,
                              _google_headers(), timeout, retries=retries)
            return _inline_data(body)
        except LLMError as e:
            error = e
            if e.code not in (400,):      # only fall through on bad parameters
                raise
    raise error


def _openrouter_image(model, prompt, aspect, timeout, retries):
    variants = []
    if aspect:
        variants.append({'modalities': ['image', 'text'],
                         'imageConfig': {'aspectRatio': aspect}})
    variants.append({'modalities': ['image', 'text']})
    error = None
    for extra in variants:
        payload = {'model': model,
                   'messages': [{'role': 'user', 'content': prompt}],
                   'max_tokens': 4096}
        payload.update(extra)
        try:
            body = _post_json(f'{OPENROUTER_BASE}/chat/completions', payload,
                              _openrouter_headers(), timeout, retries=retries)
            return _image_from_openrouter(body)
        except LLMError as e:
            error = e
            if e.code not in (400,):
                raise
    raise error


def _image_from_openrouter(body):
    try:
        message = body['choices'][0]['message']
    except (KeyError, IndexError, TypeError):
        raise LLMError(f'unexpected OpenRouter image response: '
                       f'{json.dumps(body)[:400]}')
    images = message.get('images') or []
    for entry in images:
        url = (entry.get('image_url') or {}).get('url') or entry.get('url')
        if not url:
            continue
        if url.startswith('data:'):
            header, _, data = url.partition(',')
            mime = header[5:].split(';')[0] if header.startswith('data:') else ''
            return base64.b64decode(data), mime or 'image/png'
        with urllib.request.urlopen(url, timeout=60) as response:
            mime = response.headers.get_content_type() or 'image/png'
            return response.read(), mime
    content = message.get('content')
    if isinstance(content, str) and content.startswith('data:'):
        header, _, data = content.partition(',')
        mime = header[5:].split(';')[0]
        return base64.b64decode(data), mime
    raise LLMError(f'no image in OpenRouter response: '
                   f'{json.dumps(body)[:400]}')


def generate_image(prompt, model=None, aspect=None, timeout=240, retries=4):
    """Return (image_bytes, mime_type) for a text prompt."""
    if aspect is None:
        aspect = os.environ.get('IMAGE_ASPECT') or '16:9'
    candidates = _model_candidates('image', model)
    if not candidates:
        raise LLMError('no provider available for image generation')
    error = None
    for provider, name in candidates:
        try:
            if provider == OPENROUTER:
                return _openrouter_image(name, prompt, aspect, timeout, retries)
            return _google_image(name, prompt, aspect, timeout, retries)
        except LLMError as e:
            error = e
            continue
    raise error


# ------------------------------------------------------------------ TTS (both)

def _apply_voice_style(text, voice, style):
    if style:
        return f'{style.rstrip(":")}: {text}', voice
    return text, voice


def _google_tts(model, text, voice, style, timeout, retries):
    prompt, voice = _apply_voice_style(text, voice, style)
    payload = {
        'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {
                'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}},
            },
        },
    }
    body = _post_json(f'{API_BASE}/{model}:generateContent', payload,
                      _google_headers(), timeout, retries=retries)
    data, mime = _inline_data(body)
    rate = 24000
    match = re.search(r'rate=(\d+)', mime)
    if match:
        rate = int(match.group(1))
    return data, rate


def _openrouter_tts(model, text, voice, style, timeout, retries):
    prompt, voice = _apply_voice_style(text, voice, style)
    payload = {'model': model, 'input': prompt, 'voice': voice,
               'response_format': 'pcm'}
    request = urllib.request.Request(
        f'{OPENROUTER_BASE}/audio/speech',
        data=json.dumps(payload).encode('utf-8'),
        headers=_openrouter_headers(),
        method='POST',
    )
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = response.read()
                ctype = response.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:600]
            last = LLMError(f'HTTP {e.code} from openrouter audio/speech: {body}',
                            code=e.code)
            if e.code in (400, 401, 402, 403):
                raise last
            time.sleep(min(2 ** attempt, 15))
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = LLMError(f'network error calling openrouter audio/speech: {e}',
                            code=None)
            time.sleep(min(2 ** attempt, 15))
            continue
        rate = 24000
        match = re.search(r'rate=(\d+)', ctype)
        if match:
            rate = int(match.group(1))
        return data, rate
    raise last if last else LLMError('openrouter audio/speech failed')


def tts(text, model=None, voice=None, style=None, timeout=180, retries=4):
    """Return (pcm_bytes, sample_rate) for narration text."""
    voice = voice or os.environ.get('AUDIO_VOICE') or DEFAULTS['voice']
    if not style:
        style = os.environ.get('AUDIO_STYLE') or None
    candidates = _model_candidates('audio', model)
    if not candidates:
        raise LLMError('no provider available for TTS')
    error = None
    for provider, name in candidates:
        try:
            if provider == OPENROUTER:
                return _openrouter_tts(name, text, voice, style, timeout, retries)
            return _google_tts(name, text, voice, style, timeout, retries)
        except LLMError as e:
            error = e
            continue
    raise error


# ---------------------------------------------------------------- text utils

def strip_fence(text):
    """Remove ``` / ```json fences around a payload, if present."""
    text = text.strip()
    match = re.search(r'```(?:json|javascript|js)?\s*\n(.*?)\n?```', text, re.S)
    if match:
        return match.group(1).strip()
    return text


def extract_json(text):
    """Parse the first JSON object/array found in text (fences tolerated).

    Raises LLMError with a snippet when nothing parses.
    """
    decoder = json.JSONDecoder()
    candidates = []
    fenced = strip_fence(text)
    if fenced:
        candidates.append(fenced)
    stripped = text.strip()
    if stripped and stripped not in candidates:
        candidates.append(stripped)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except ValueError:
            pass
        for index, char in enumerate(candidate):
            if char not in '{[':
                continue
            try:
                value, _ = decoder.raw_decode(candidate[index:])
                return value
            except ValueError:
                continue
    raise LLMError(f'no JSON found in model output: {text[:300]!r}')


def fenced_blocks(text, langs=None):
    """Return [(lang, body, text_before)] for fenced code blocks, in order."""
    pattern = re.compile(r'^[ \t]*```([A-Za-z0-9_+#-]*)[ \t]*\r?\n(.*?)^[ \t]*```[ \t]*$',
                         re.M | re.S)
    blocks = []
    for match in pattern.finditer(text):
        lang = (match.group(1) or '').lower()
        if langs and lang and lang not in langs:
            continue
        blocks.append((lang, match.group(2),
                       text[max(0, match.start() - 400):match.start()]))
    return blocks
