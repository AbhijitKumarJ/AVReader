class ModularHardwareSharingAnim {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 800;
    this.height = 460;
  }

  mount(container) {
    this.unmount();
    this.container = container;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = `${this.width}px`;
    wrapper.style.margin = '0 auto';
    wrapper.style.aspectRatio = `${this.width} / ${this.height}`;
    wrapper.style.background = '#0d1117';
    wrapper.style.borderRadius = '12px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.border = '1px solid #21262d';
    wrapper.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.4)';

    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    wrapper.appendChild(canvas);
    this.container.appendChild(wrapper);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  unmount() {
    if (this.container) {
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
    }
    this.container = null;
    this.canvas = null;
    this.ctx = null;
  }

  render(localTimeMs) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Cycle through 5000ms loop
    const loopDuration = 5000;
    const tMs = ((localTimeMs % loopDuration) + loopDuration) % loopDuration;
    const t = tMs / 1000; // 0 to 5 seconds

    // Coordinate positions
    const brick = { x: 400, y: 220 };
    const clients = [
      {
        id: 0,
        name: 'Desk A: Creative Suite',
        sub: '4K Neural Upscale & Render',
        x: 180,
        y: 120,
        color: '#38bdf8', // Cyan
        glow: 'rgba(56, 189, 248, 0.6)'
      },
      {
        id: 1,
        name: 'Laptop B: Local LLM Agent',
        sub: '32k Token Context Batching',
        x: 620,
        y: 120,
        color: '#c084fc', // Violet/Magenta
        glow: 'rgba(192, 132, 252, 0.6)'
      },
      {
        id: 2,
        name: 'Station C: Simulation Lab',
        sub: 'Real-time Physics & Denoise',
        x: 400,
        y: 380,
        color: '#34d399', // Emerald
        glow: 'rgba(52, 211, 153, 0.6)'
      }
    ];

    // Determine phase & weights
    // Slices:
    // 0.0 - 0.4s: Standby handoff / overview
    // 0.4 - 1.8s: Client 0 Active (1.4s)
    // 1.8 - 3.2s: Client 1 Active (1.4s)
    // 3.2 - 4.6s: Client 2 Active (1.4s)
    // 4.6 - 5.0s: Fast dynamic handover sweep
    let activeClient = -1;
    let activityWeights = [0, 0, 0];

    if (t < 0.4) {
      activeClient = -1;
      activityWeights = [0.1, 0.1, 0.1];
    } else if (t >= 0.4 && t < 1.8) {
      activeClient = 0;
      const progress = (t - 0.4) / 1.4;
      activityWeights[0] = Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 6 + 1);
    } else if (t >= 1.8 && t < 3.2) {
      activeClient = 1;
      const progress = (t - 1.8) / 1.4;
      activityWeights[1] = Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 6 + 1);
    } else if (t >= 3.2 && t < 4.6) {
      activeClient = 2;
      const progress = (t - 3.2) / 1.4;
      activityWeights[2] = Math.min(1, progress * 4) * Math.min(1, (1 - progress) * 6 + 1);
    } else {
      activeClient = -1;
      const p = (t - 4.6) / 0.4;
      activityWeights = [0.3 * (1 - p), 0.3 * (1 - p), 0.3 * (1 - p)];
    }

    // Clear Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw header HUD
    this._drawHUD(ctx, t, activeClient);

    // Draw connection channels & active packet streams
    clients.forEach((client, index) => {
      this._drawConnectionStream(ctx, brick, client, activityWeights[index], t);
    });

    // Draw Clients (Laptops)
    clients.forEach((client, index) => {
      this._drawLaptop(ctx, client, activityWeights[index], t);
    });

    // Draw Central Modular Compute Brick
    this._drawBrick(ctx, brick, activeClient, activityWeights, t);
  }

  _drawHUD(ctx, t, activeClient) {
    ctx.save();
    // Top banner
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'left';
    ctx.fillText('DYNAMIC ACCELERATOR FABRIC', 30, 32);

    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';

    let statusText = 'TIME-SLICE: ARBITRATING REQUESTS';
    let statusColor = '#8b949e';
    if (activeClient === 0) {
      statusText = 'ALLOCATED: WORKSTATION A (VIDEO DENOISE 4K)';
      statusColor = '#38bdf8';
    } else if (activeClient === 1) {
      statusText = 'ALLOCATED: LAPTOP B (NEURAL TOKEN INFERENCE)';
      statusColor = '#c084fc';
    } else if (activeClient === 2) {
      statusText = 'ALLOCATED: STATION C (SIMULATION KERNELS)';
      statusColor = '#34d399';
    }

    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, 770, 32);

    // Active bandwidth gauge bar
    ctx.fillStyle = '#21262d';
    ctx.fillRect(30, 42, 740, 3);

    const activeRatio = (t % 5.0) / 5.0;
    ctx.fillStyle = activeClient >= 0 ? statusColor : '#484f58';
    ctx.fillRect(30, 42, 740 * activeRatio, 3);
    ctx.restore();
  }

  _drawConnectionStream(ctx, brick, client, weight, t) {
    ctx.save();
    // Control point for smooth curved cable
    const cx = (brick.x + client.x) / 2 + (client.x < brick.x ? -20 : client.x > brick.x ? 20 : 0);
    const cy = (brick.y + client.y) / 2 + 10;

    // Passive cable trace
    ctx.beginPath();
    ctx.moveTo(brick.x, brick.y);
    ctx.quadraticCurveTo(cx, cy, client.x, client.y);
    ctx.strokeStyle = '#1f242c';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Active highlight line
    if (weight > 0.05) {
      ctx.beginPath();
      ctx.moveTo(brick.x, brick.y);
      ctx.quadraticCurveTo(cx, cy, client.x, client.y);
      ctx.strokeStyle = client.color;
      ctx.globalAlpha = Math.min(1, weight * 0.85);
      ctx.lineWidth = 2 + weight * 2.5;
      ctx.shadowColor = client.color;
      ctx.shadowBlur = 12 * weight;
      ctx.stroke();

      // Traveling packets along quadratic bezier
      const packetCount = 8;
      const speed = 1.35; // speed multiplier
      for (let i = 0; i < packetCount; i++) {
        const offset = i / packetCount;
        const progress = (t * speed + offset) % 1.0;

        // Quadratic bezier point: B(u) = (1-u)^2 * P0 + 2(1-u)u * P1 + u^2 * P2
        const u = progress;
        const px = (1 - u) * (1 - u) * brick.x + 2 * (1 - u) * u * cx + u * u * client.x;
        const py = (1 - u) * (1 - u) * brick.y + 2 * (1 - u) * u * cy + u * u * client.y;

        const pAlpha = Math.sin(progress * Math.PI) * weight;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = client.color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = pAlpha;

        ctx.beginPath();
        ctx.arc(px, py, 2.5 + weight * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawLaptop(ctx, client, weight, t) {
    ctx.save();
    const lx = client.x;
    const ly = client.y;
    const isActive = weight > 0.2;
    const accent = client.color;

    // Screen shell dimensions
    const sw = 90;
    const sh = 56;
    const sx = lx - sw / 2;
    const sy = ly - sh;

    // Ambient glow if active
    if (weight > 0.1) {
      const glowGrad = ctx.createRadialGradient(lx, ly - 28, 5, lx, ly - 28, 70);
      glowGrad.addColorStop(0, client.glow);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(lx - 80, ly - 70, 160, 100);
    }

    // Outer screen bezel
    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = isActive ? accent : '#30363d';
    ctx.lineWidth = isActive ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, [6, 6, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Inner screen display
    const bw = sw - 10;
    const bh = sh - 10;
    const bx = sx + 5;
    const by = sy + 5;
    ctx.fillStyle = isActive ? '#06090e' : '#0b0e14';
    ctx.fillRect(bx, by, bw, bh);

    // Screen dynamic content
    if (isActive) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();

      if (client.id === 0) {
        // Video render bars
        ctx.fillStyle = accent;
        for (let b = 0; b < 6; b++) {
          const hVal = Math.sin(t * 8 + b) * 10 + 16;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(bx + 8 + b * 11, by + bh - hVal - 4, 8, hVal);
        }
      } else if (client.id === 1) {
        // LLM Text token streams
        ctx.fillStyle = accent;
        for (let l = 0; l < 4; l++) {
          const lw = ((t * 40 + l * 25) % (bw - 16)) + 10;
          ctx.globalAlpha = 0.75 - l * 0.12;
          ctx.fillRect(bx + 6, by + 8 + l * 8, Math.min(lw, bw - 12), 4);
        }
      } else {
        // Simulation wireframe / particles
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const phase = t * 4;
        for (let p = 0; p < 7; p++) {
          const px = bx + 10 + p * 9;
          const py = by + bh / 2 + Math.sin(phase + p) * 11;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Standby icon
      ctx.fillStyle = '#21262d';
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by + bh / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Laptop Base / Keyboard deck
    const kw = sw + 26;
    const kh = 8;
    const kx = lx - kw / 2;
    const ky = ly;
    ctx.fillStyle = '#21262d';
    ctx.strokeStyle = isActive ? accent : '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(kx, ky, kw, kh, [0, 0, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Touchpad notch
    ctx.fillStyle = isActive ? accent : '#30363d';
    ctx.fillRect(lx - 12, ky + 1, 24, 2);

    // Labels & Allocation Badge
    ctx.textAlign = 'center';
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isActive ? '#f0f6fc' : '#8b949e';
    ctx.fillText(client.name, lx, ly + 25);

    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = isActive ? accent : '#484f58';
    ctx.fillText(client.sub, lx, ly + 38);

    // Bandwidth tag
    if (isActive) {
      const tagW = 74;
      const tagH = 16;
      ctx.fillStyle = 'rgba(22, 27, 34, 0.9)';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx - tagW / 2, ly - sh - 22, tagW, tagH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = accent;
      ctx.fillText('96.4 GB/s BUS', lx, ly - sh - 11);
    }

    ctx.restore();
  }

  _drawBrick(ctx, brick, activeClient, activityWeights, t) {
    ctx.save();
    const bx = brick.x;
    const by = brick.y;
    const bw = 140;
    const bh = 80;
    const rx = bx - bw / 2;
    const ry = by - bh / 2;

    // Active color determined by current dominant client
    let activeColor = '#f59e0b'; // Amber idle default
    if (activeClient === 0) activeColor = '#38bdf8';
    else if (activeClient === 1) activeColor = '#c084fc';
    else if (activeClient === 2) activeColor = '#34d399';

    // Outer aura glow
    const maxWeight = Math.max(...activityWeights, 0.2);
    const auraGrad = ctx.createRadialGradient(bx, by, 10, bx, by, 100);
    auraGrad.addColorStop(0, activeColor + '44');
    auraGrad.addColorStop(1, 'rgba(13, 17, 23, 0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(bx - 120, by - 100, 240, 200);

    // Modular compute brick chassis
    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(rx, ry, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    // Heatsink cooling fins on top & bottom
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1.5;
    for (let f = -bw / 2 + 14; f < bw / 2 - 10; f += 8) {
      // Top fins
      ctx.beginPath();
      ctx.moveTo(bx + f, ry + 2);
      ctx.lineTo(bx + f, ry + 8);
      ctx.stroke();

      // Bottom fins
      ctx.beginPath();
      ctx.moveTo(bx + f, ry + bh - 8);
      ctx.lineTo(bx + f, ry + bh - 2);
      ctx.stroke();
    }

    // Silicon Accelerator Core Die
    const cw = 56;
    const ch = 34;
    ctx.fillStyle = '#0d1117';
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur = 10 * maxWeight;
    ctx.beginPath();
    ctx.roundRect(bx - cw / 2, by - ch / 2 - 2, cw, ch, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pulsing central indicator inside core
    const pulseRadius = 5 + Math.sin(t * 6) * 1.5;
    ctx.fillStyle = activeColor;
    ctx.beginPath();
    ctx.arc(bx, by - 2, pulseRadius, 0, Math.PI * 2);
    ctx.fill();

    // Brick status typography
    ctx.textAlign = 'center';
    ctx.font = '700 9px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f0f6fc';
    ctx.fillText('SHARED ACCELERATOR', bx, ry + 22);

    ctx.font = '600 8px monospace';
    ctx.fillStyle = activeColor;
    ctx.fillText(activeClient >= 0 ? 'STATUS: DYNAMIC STREAM' : 'STATUS: POOL IDLE', bx, ry + bh - 14);

    // LED Status dots
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = activityWeights[i] > 0.2 ? clientsColor(i) : '#30363d';
      ctx.beginPath();
      ctx.arc(bx - 12 + i * 12, ry + bh - 23, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    function clientsColor(idx) {
      if (idx === 0) return '#38bdf8';
      if (idx === 1) return '#c084fc';
      return '#34d399';
    }
  }
}
