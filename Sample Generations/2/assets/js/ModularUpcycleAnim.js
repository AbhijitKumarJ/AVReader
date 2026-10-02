class ModularUpcycleAnim {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.resizeObserver = null;
  }

  mount(container) {
    this.unmount();
    this.container = container;

    this.container.style.position = 'relative';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.minHeight = '360px';
    this.container.style.backgroundColor = '#0d1117';
    this.container.style.overflow = 'hidden';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.userSelect = 'none';

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    const updateSize = () => {
      if (!this.container || !this.canvas) return;
      const rect = this.container.getBoundingClientRect();
      this.width = Math.max(rect.width, 320);
      this.height = Math.max(rect.height, 240);
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
    };

    updateSize();

    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => updateSize());
      this.resizeObserver.observe(this.container);
    }
  }

  unmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  render(localTimeMs) {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, w, h);

    // Virtual target space: 800 x 480
    const targetW = 800;
    const targetH = 480;
    const scale = Math.min(w / targetW, h / targetH) * 0.95;
    const offsetX = (w - targetW * scale) / 2;
    const offsetY = (h - targetH * scale) / 2;

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Time cycle / clamp parameters (loop cleanly across 6s or follow timeline)
    const t = Math.max(0, localTimeMs % 6000);

    // Sub-stage progress factors
    // 0-1000ms: Laptop sits legacy/dim
    // 1000-2200ms: Modular block arrives
    const slideP = Math.min(Math.max((t - 1000) / 1200, 0), 1);
    const easeSlide = 1 - Math.pow(1 - slideP, 3);

    // 2200-2800ms: Cable plug snaps in
    const plugP = Math.min(Math.max((t - 2200) / 600, 0), 1);

    // 2800-3800ms: Surge energy pulse travels along the cable
    const pulseP = Math.min(Math.max((t - 2800) / 900, 0), 1);

    // 3400-5000ms: Laptop upgrades to active neural compute state
    const upgradeP = Math.min(Math.max((t - 3300) / 1200, 0), 1);
    const easeUpgrade = Math.sin((upgradeP * Math.PI) / 2);

    // 1. Tech desk background grid & ambient floor glow
    this.drawBackground(ctx, targetW, targetH, upgradeP);

    // Coordinate positions
    const laptopX = 70;
    const laptopY = 110;
    const blockStartOffset = 280;
    const blockTargetX = 530;
    const blockX = blockTargetX + (1 - easeSlide) * blockStartOffset;
    const blockY = 220;

    // Cable connection points
    const laptopPortX = laptopX + 265;
    const laptopPortY = 328;
    const blockPortX = blockX + 15;
    const blockPortY = 328;

    // 2. Draw Sleek Modular Compute Block
    if (slideP > 0) {
      this.drawComputeBlock(ctx, blockX, blockY, t, slideP);
    }

    // 3. Draw Connecting Cable & Energy Flow
    if (slideP > 0.4) {
      this.drawCable(
        ctx,
        laptopPortX,
        laptopPortY,
        blockPortX,
        blockPortY,
        plugP,
        pulseP,
        upgradeP,
        t
      );
    }

    // 4. Draw Laptop Base & Screen
    this.drawLaptop(ctx, laptopX, laptopY, upgradeP, easeUpgrade, t);

    ctx.restore();
  }

  drawBackground(ctx, w, h, upgradeP) {
    // Subtle floor perspective grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 260);
      ctx.lineTo(x + (x - w / 2) * 0.45, h);
      ctx.stroke();
    }
    for (let y = 280; y <= h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Ambient radial glows
    const glow = ctx.createRadialGradient(
      210,
      250,
      20,
      210,
      250,
      upgradeP > 0 ? 300 : 150
    );
    const alpha = 0.04 + upgradeP * 0.12;
    glow.addColorStop(0, `rgba(16, 185, 129, ${alpha})`);
    glow.addColorStop(1, 'rgba(13, 17, 23, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }

  drawLaptop(ctx, x, y, upgradeP, easeUpgrade, t) {
    ctx.save();

    // Shadow under laptop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(x + 130, y + 250, 160, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vintage Thick Bezel Screen (Upright display)
    const screenBezelW = 220;
    const screenBezelH = 175;
    const screenX = x + 25;
    const screenY = y;

    // Display Outer Frame (Heavy charcoal matte)
    ctx.fillStyle = '#1c2128';
    ctx.strokeStyle = '#2d333b';
    ctx.lineWidth = 2;
    this.roundRect(ctx, screenX, screenY, screenBezelW, screenBezelH, 6);
    ctx.fill();
    ctx.stroke();

    // Vintage Badge
    ctx.fillStyle = '#768390';
    ctx.font = '8px monospace';
    ctx.fillText('RETRO-MOD // WORKSTATION 2012', screenX + 16, screenY + 12);

    // Display Active Screen Panel
    const dispX = screenX + 12;
    const dispY = screenY + 18;
    const dispW = screenBezelW - 24;
    const dispH = screenBezelH - 28;

    // Screen BG color blends from dull amber/black to modern high-tech navy/black
    const bgAmber = [14, 12, 10];
    const bgGreen = [7, 21, 23];
    const curR = Math.round(bgAmber[0] + (bgGreen[0] - bgAmber[0]) * upgradeP);
    const curG = Math.round(bgAmber[1] + (bgGreen[1] - bgAmber[1]) * upgradeP);
    const curB = Math.round(bgAmber[2] + (bgGreen[2] - bgAmber[2]) * upgradeP);

    ctx.fillStyle = `rgb(${curR}, ${curG}, ${curB})`;
    ctx.fillRect(dispX, dispY, dispW, dispH);

    // Screen Content
    this.drawScreenContent(ctx, dispX, dispY, dispW, dispH, upgradeP, easeUpgrade, t);

    // Screen scanline overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let sl = dispY; sl < dispY + dispH; sl += 3) {
      ctx.fillRect(dispX, sl, dispW, 1.2);
    }

    // Screen glare gloss
    const gloss = ctx.createLinearGradient(dispX, dispY, dispX + dispW, dispY + dispH);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    gloss.addColorStop(0.35, 'rgba(255, 255, 255, 0.01)');
    gloss.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = gloss;
    ctx.fillRect(dispX, dispY, dispW, dispH);

    // Display Hinges
    ctx.fillStyle = '#373e47';
    ctx.fillRect(screenX + 30, screenY + screenBezelH - 2, 26, 10);
    ctx.fillRect(screenX + screenBezelW - 56, screenY + screenBezelH - 2, 26, 10);

    // Laptop Base Chassis (Angled perspective keyboard deck)
    const baseY = y + screenBezelH + 4;
    ctx.fillStyle = '#22272e';
    ctx.strokeStyle = '#373e47';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(x + 10, baseY);
    ctx.lineTo(x + 260, baseY);
    ctx.lineTo(x + 295, baseY + 66);
    ctx.lineTo(x - 20, baseY + 66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chassis front bevel
    ctx.fillStyle = '#161b22';
    ctx.beginPath();
    ctx.moveTo(x - 20, baseY + 66);
    ctx.lineTo(x + 295, baseY + 66);
    ctx.lineTo(x + 295, baseY + 78);
    ctx.lineTo(x - 20, baseY + 78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Keyboard well
    ctx.fillStyle = '#12161c';
    ctx.beginPath();
    ctx.moveTo(x + 26, baseY + 6);
    ctx.lineTo(x + 244, baseY + 6);
    ctx.lineTo(x + 258, baseY + 42);
    ctx.lineTo(x + 14, baseY + 42);
    ctx.closePath();
    ctx.fill();

    // Trackpoint red dot
    ctx.fillStyle = '#e5534b';
    ctx.beginPath();
    ctx.arc(x + 136, baseY + 24, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Side Port (where modern module connects)
    const portX = x + 264;
    const portY = baseY + 46;
    ctx.fillStyle = upgradeP > 0.2 ? '#10b981' : '#444c56';
    ctx.fillRect(portX, portY, 5, 8);

    if (upgradeP > 0) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8 * upgradeP;
      ctx.fillStyle = '#34d399';
      ctx.fillRect(portX + 1, portY + 1, 3, 6);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  drawScreenContent(ctx, x, y, w, h, upgradeP, easeUpgrade, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // Amber legacy display state
    if (upgradeP < 1) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - upgradeP * 1.5);

      // Flickering dim amber
      const flicker = 0.85 + 0.15 * Math.sin(t * 0.03);
      ctx.fillStyle = `rgba(217, 119, 6, ${0.8 * flicker})`;
      ctx.font = 'bold 9px monospace';
      ctx.fillText('LEGACY HOST STATUS', x + 8, y + 14);

      ctx.fillStyle = `rgba(180, 100, 10, ${0.7 * flicker})`;
      ctx.font = '8px monospace';
      ctx.fillText('ARCH: 64-BIT X86 GEN-2', x + 8, y + 27);
      ctx.fillText('CORE SPEED: 1.20 GHz', x + 8, y + 38);
      ctx.fillText('PEAK FLOPS: 0.48 TFLOPS', x + 8, y + 49);

      // Bottleneck warning badge
      ctx.fillStyle = 'rgba(180, 83, 9, 0.2)';
      ctx.fillRect(x + 8, y + 58, w - 16, 20);
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.4)';
      ctx.strokeRect(x + 8, y + 58, w - 16, 20);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('! NPU DETECT: NOT FOUND', x + 14, y + 71);

      // Dim legacy memory bar
      ctx.fillStyle = 'rgba(146, 64, 14, 0.3)';
      ctx.fillRect(x + 8, y + 88, w - 16, 8);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x + 8, y + 88, (w - 16) * 0.35, 8);
      ctx.font = '7px monospace';
      ctx.fillText('THROUGHPUT: SATURATED (480 GFLOPS)', x + 8, y + 106);

      ctx.restore();
    }

    // Modern Upcycled Neural Network State
    if (upgradeP > 0) {
      ctx.save();
      ctx.globalAlpha = easeUpgrade;

      // Glow backdrop
      const ng = ctx.createRadialGradient(x + w / 2, y + h / 2, 5, x + w / 2, y + h / 2, 90);
      ng.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      ng.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
      ctx.fillStyle = ng;
      ctx.fillRect(x, y, w, h);

      // Header status
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('MODULAR NPU: SYNC ACTIVE', x + 8, y + 14);
      ctx.shadowBlur = 0;

      ctx.font = '8px monospace';
      ctx.fillStyle = '#67e8f9';
      ctx.fillText('INT8 INFERENCE: 48.2 TOPS', x + 8, y + 26);
      ctx.fillStyle = '#a7f3d0';
      ctx.fillText('OFFLOAD BANDWIDTH: 40 Gb/s', x + 8, y + 36);

      // Realtime Tensor Gauge / Multi-Core Utilization Bars
      const barY = y + 43;
      const barCount = 7;
      const barW = (w - 20) / barCount - 3;
      for (let i = 0; i < barCount; i++) {
        const osc = 0.55 + 0.4 * Math.sin(t * 0.008 + i * 1.1);
        const barH = 22 * osc * easeUpgrade;
        const bx = x + 10 + i * (barW + 3);

        ctx.fillStyle = 'rgba(6, 78, 59, 0.5)';
        ctx.fillRect(bx, barY, barW, 22);

        // Gradient for active tensor core bar
        const bg = ctx.createLinearGradient(bx, barY + 22 - barH, bx, barY + 22);
        bg.addColorStop(0, '#34d399');
        bg.addColorStop(1, '#06b6d4');
        ctx.fillStyle = bg;
        ctx.fillRect(bx, barY + 22 - barH, barW, barH);
      }

      // Live Neural Layer Topology diagram
      const netY = y + 74;
      const netH = 34;
      ctx.fillStyle = 'rgba(4, 47, 46, 0.4)';
      ctx.fillRect(x + 8, netY, w - 16, netH);
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.25)';
      ctx.strokeRect(x + 8, netY, w - 16, netH);

      // Animated connected neural nodes
      const layers = [3, 4, 3];
      const layerSpacing = (w - 36) / (layers.length - 1);
      const nodeCoords = [];

      for (let l = 0; l < layers.length; l++) {
        const count = layers[l];
        nodeCoords[l] = [];
        const nodeSpacing = (netH - 10) / (count - 1 || 1);
        for (let n = 0; n < count; n++) {
          const nx = x + 18 + l * layerSpacing;
          const ny = netY + 5 + n * nodeSpacing;
          nodeCoords[l].push({ x: nx, y: ny });
        }
      }

      // Draw connections
      for (let l = 0; l < layers.length - 1; l++) {
        for (let a = 0; a < nodeCoords[l].length; a++) {
          for (let b = 0; b < nodeCoords[l + 1].length; b++) {
            const pulse = (Math.sin(t * 0.012 + a * 0.7 + b * 0.9) + 1) / 2;
            ctx.strokeStyle = `rgba(52, 211, 153, ${0.15 + pulse * 0.45})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(nodeCoords[l][a].x, nodeCoords[l][a].y);
            ctx.lineTo(nodeCoords[l + 1][b].x, nodeCoords[l + 1][b].y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (let l = 0; l < layers.length; l++) {
        for (let n = 0; n < nodeCoords[l].length; n++) {
          const pt = nodeCoords[l][n];
          ctx.fillStyle = '#6ee7b7';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Bottom dynamic performance counter
      const opsCounter = (28.4 + 19.8 * easeUpgrade * (0.95 + 0.05 * Math.sin(t * 0.02))).toFixed(1);
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#34d399';
      ctx.fillText(`+${opsCounter} TOPS ACCELERATION ACTIVE`, x + 10, y + 118);

      ctx.restore();
    }

    // Green scan wipe during transformation
    if (upgradeP > 0.02 && upgradeP < 0.95) {
      const scanY = y + upgradeP * h;
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x, scanY);
      ctx.lineTo(x + w, scanY);
      ctx.stroke();

      const sweepGrad = ctx.createLinearGradient(x, scanY - 14, x, scanY);
      sweepGrad.addColorStop(0, 'rgba(52, 211, 153, 0)');
      sweepGrad.addColorStop(1, 'rgba(52, 211, 153, 0.4)');
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(x, scanY - 14, w, 14);
      ctx.restore();
    }

    ctx.restore();
  }

  drawComputeBlock(ctx, x, y, t, slideP) {
    ctx.save();

    const blockW = 160;
    const blockH = 105;

    // Soft drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x + blockW / 2, y + blockH + 12, blockW * 0.55, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Futuristic Sleek Metallic Chassis
    const bodyGrad = ctx.createLinearGradient(x, y, x + blockW, y + blockH);
    bodyGrad.addColorStop(0, '#1f2937');
    bodyGrad.addColorStop(0.5, '#111827');
    bodyGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, x, y, blockW, blockH, 8);
    ctx.fill();
    ctx.stroke();

    // Anodized chamfer trim
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x + 3, y + 3, blockW - 6, blockH - 6, 6);
    ctx.stroke();

    // Heat dissipation fins
    ctx.fillStyle = '#0b0f17';
    for (let fin = 0; fin < 5; fin++) {
      ctx.fillRect(x + 14 + fin * 12, y + 16, 6, 24);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(x + 14 + fin * 12, y + 36, 6, 4);
      ctx.fillStyle = '#0b0f17';
    }

    // Glowing Holographic / Neon Silicon Core
    const coreX = x + 110;
    const coreY = y + 28;
    const coreRadius = 16;

    const corePulse = (Math.sin(t * 0.006) + 1) / 2;
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 12 + 6 * corePulse;

    const coreGrad = ctx.createRadialGradient(coreX, coreY, 2, coreX, coreY, coreRadius);
    coreGrad.addColorStop(0, '#ecfdf5');
    coreGrad.addColorStop(0.4, '#34d399');
    coreGrad.addColorStop(1, '#059669');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(coreX, coreY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Silicon Core Circuit Geometry
    ctx.strokeStyle = '#064e3b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(coreX, coreY, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Compute Block Specification Typography
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('MODULAR TENSOR ACCEL', x + 14, y + 58);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px monospace';
    ctx.fillText('EDGE-NPU v4 // 128 TENSOR CORES', x + 14, y + 70);

    // Status Indicator Strip
    const ledColor = '#10b981';
    ctx.shadowColor = ledColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = ledColor;
    ctx.beginPath();
    ctx.arc(x + 20, y + 88, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#94a3b8';
    ctx.font = '7px monospace';
    ctx.fillText('STATUS: SYNCHRONIZED', x + 28, y + 90);

    // Host Outport on the left edge
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 4, y + 54, 4, 12);

    ctx.restore();
  }

  drawCable(ctx, x1, y1, x2, y2, plugP, pulseP, upgradeP, t) {
    ctx.save();

    // The plug moves towards laptop port
    // Connected when plugP = 1
    const currentPlugX = x2 - (x2 - x1) * plugP;
    const currentPlugY = y1;

    // Spline curve for flexible high-bandwidth optical/copper braided cable
    const midX = (currentPlugX + x2) / 2;
    const sag = 45 * Math.sin(plugP * Math.PI * 0.5);
    const midY = (y1 + y2) / 2 + sag;

    // Outer cable jacket
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(currentPlugX, currentPlugY);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();

    // Inner shielding line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Metallic connector head
    ctx.fillStyle = '#64748b';
    ctx.fillRect(currentPlugX - 10, currentPlugY - 5, 10, 10);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(currentPlugX - 2, currentPlugY - 3, 2, 6);

    // Snap burst when first reaching port (plugP ~ 1)
    if (plugP > 0.85 && pulseP < 0.25) {
      const burstAlpha = 1 - (pulseP / 0.25);
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `rgba(167, 243, 208, ${burstAlpha})`;
      ctx.lineWidth = 1.5;

      for (let s = 0; s < 6; s++) {
        const ang = (s * Math.PI) / 3;
        const rad = 6 + 10 * burstAlpha;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + Math.cos(ang) * rad, y1 + Math.sin(ang) * rad);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // High-speed vibrant green power & data pulse along cable
    if (pulseP > 0 || upgradeP > 0) {
      // Glow along entire cable when connected & operational
      if (upgradeP > 0) {
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10 * upgradeP;
        ctx.strokeStyle = `rgba(16, 185, 129, ${0.45 * upgradeP})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Traveling power packet bursts
      const packetCount = 4;
      for (let i = 0; i < packetCount; i++) {
        // Compute position along curve: traveling from block (u=1) to laptop (u=0)
        let prog = (pulseP * 2.2 + i * (1 / packetCount) + t * 0.0006) % 1;
        const u = 1 - prog; // Travel right-to-left

        // Quadratic Bezier point formula: B(u) = (1-u)^2*P0 + 2(1-u)u*P1 + u^2*P2
        const inv = 1 - u;
        const px = inv * inv * x1 + 2 * inv * u * midX + u * u * x2;
        const py = inv * inv * y1 + 2 * inv * u * midY + u * u * y2;

        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ecfdf5';
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Secondary trailing tail
        ctx.fillStyle = 'rgba(52, 211, 153, 0.4)';
        ctx.beginPath();
        ctx.arc(px + 3, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
