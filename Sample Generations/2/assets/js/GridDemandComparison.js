class GridDemandComparison {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.resizeObserver = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }

  mount(container) {
    this.unmount();
    this.container = container;

    // Outer wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.style.width = '100%';
    this.wrapper.style.height = '100%';
    this.wrapper.style.minHeight = '360px';
    this.wrapper.style.backgroundColor = '#0d1117';
    this.wrapper.style.position = 'relative';
    this.wrapper.style.overflow = 'hidden';
    this.wrapper.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';

    // Canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.wrapper.appendChild(this.canvas);
    this.container.appendChild(this.wrapper);

    this.ctx = this.canvas.getContext('2d');

    // Resize observer for responsive crisp rendering
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.wrapper);
    this.resize();
  }

  resize() {
    if (!this.wrapper || !this.canvas) return;
    const rect = this.wrapper.getBoundingClientRect();
    this.width = rect.width || 640;
    this.height = rect.height || 360;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  unmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    this.wrapper = null;
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  render(localTimeMs) {
    if (!this.ctx || this.width === 0 || this.height === 0) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Timeline calculations: 4.5s cycle loop with smooth wrap
    const cycleDuration = 4500;
    const tCycle = (localTimeMs % cycleDuration) / cycleDuration; // 0..1
    const timeSec = (localTimeMs % cycleDuration) / 1000;

    // --- Dynamic values computation ---
    // Left meter: Surges past 500W to peak ~615W with violent jitter and hazard flash
    let leftWatts = 0;
    if (tCycle < 0.25) {
      // Warm up / rapid surge: 85W -> 420W
      const p = tCycle / 0.25;
      const ease = p * p;
      leftWatts = 85 + ease * 335;
    } else if (tCycle < 0.55) {
      // Breaching 500W threshold
      const p = (tCycle - 0.25) / 0.3;
      leftWatts = 420 + p * 165;
    } else if (tCycle < 0.90) {
      // Overload state past 500W with instability oscillation
      const jitter = Math.sin(timeSec * 38) * 16 + Math.cos(timeSec * 64) * 8;
      leftWatts = 585 + jitter;
    } else {
      // Reset transition back to baseline
      const p = (tCycle - 0.90) / 0.10;
      const endJitter = Math.sin(timeSec * 38) * 16;
      const peakVal = 585 + endJitter;
      leftWatts = peakVal * (1 - p) + 85 * p;
    }

    // Right meter: Glides smoothly from 90W down to a locked 35W
    let rightWatts = 0;
    if (tCycle < 0.55) {
      const p = tCycle / 0.55;
      // Exponential glide down to 35W
      const ease = 1 - Math.pow(1 - p, 3);
      rightWatts = 90 - ease * 55;
    } else if (tCycle < 0.92) {
      // Highly stable 35W with micro ripple
      const calmMicro = Math.sin(timeSec * 4) * 0.25;
      rightWatts = 35 + calmMicro;
    } else {
      // Gentle return for loop
      const p = (tCycle - 0.92) / 0.08;
      rightWatts = 35 * (1 - p) + 90 * p;
    }

    // Clear background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSpacing = 32;
    for (let x = 0; x < w; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Header Title
    const titleSize = Math.max(13, Math.min(18, Math.floor(w * 0.024)));
    ctx.fillStyle = '#e6edf3';
    ctx.font = `600 ${titleSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('POWER INFRASTRUCTURE LOAD MONITOR', w * 0.5, 30);

    ctx.fillStyle = '#7d8590';
    ctx.font = `400 ${Math.max(10, titleSize - 4)}px monospace`;
    ctx.fillText('CRITICAL GRID DEMAND VS. SUSTAINABLE EDGE RUNTIME', w * 0.5, 48);

    // Layout configuration for side-by-side meters
    const contentTop = 64;
    const contentBottom = h - 36;
    const contentHeight = Math.max(180, contentBottom - contentTop);
    const meterWidth = Math.min(260, (w - 70) / 2);
    const gap = Math.min(48, Math.max(16, (w - meterWidth * 2) / 3));

    const leftX = w * 0.5 - gap * 0.5 - meterWidth;
    const rightX = w * 0.5 + gap * 0.5;

    // Render Left Meter (Surging / Grid Strain)
    this.drawLeftSurgeMeter(ctx, leftX, contentTop, meterWidth, contentHeight, leftWatts, timeSec);

    // Render Right Meter (Efficient 35W / Green Boundary)
    this.drawRightStableMeter(ctx, rightX, contentTop, meterWidth, contentHeight, rightWatts, timeSec);

    // Footer summary banner
    this.drawFooterMetrics(ctx, w * 0.5, h - 14, leftWatts, rightWatts);
  }

  drawLeftSurgeMeter(ctx, x, y, width, height, watts, timeSec) {
    const isOverload = watts >= 500;
    const surgeRatio = Math.min(1, Math.max(0, (watts - 500) / 150));

    // Meter enclosure
    ctx.save();
    ctx.lineWidth = 1.5;
    if (isOverload) {
      const flash = (Math.sin(timeSec * 22) + 1) * 0.5;
      ctx.strokeStyle = `rgba(248, 81, 73, ${0.4 + flash * 0.6})`;
      ctx.fillStyle = `rgba(248, 81, 73, ${0.05 + flash * 0.08})`;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillStyle = 'rgba(22, 27, 34, 0.7)';
    }

    // Outer bounding card
    this.roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Hazard shockwaves when exceeding 500W
    if (isOverload) {
      const numWaves = 3;
      for (let i = 0; i < numWaves; i++) {
        const waveProgress = ((timeSec * 2.2 + i / numWaves) % 1);
        const waveRadius = 10 + waveProgress * (width * 0.7);
        const waveAlpha = (1 - waveProgress) * (0.35 + surgeRatio * 0.55);

        ctx.strokeStyle = `rgba(255, 45, 60, ${waveAlpha})`;
        ctx.lineWidth = 2.5 * (1 - waveProgress) + 0.5;
        ctx.beginPath();
        // Radiate waves from gauge center
        ctx.arc(x + width * 0.5, y + height * 0.44, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Card Header
    ctx.fillStyle = isOverload ? '#ff7b72' : '#c9d1d9';
    ctx.font = '600 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('UNCONSTRAINED PEAK', x + 14, y + 24);

    // Status Pill
    ctx.textAlign = 'right';
    if (isOverload) {
      ctx.fillStyle = '#ff3838';
      ctx.fillText('● STRAIN CRITICAL', x + width - 14, y + 24);
    } else {
      ctx.fillStyle = '#d29922';
      ctx.fillText('○ NORMAL LOAD', x + width - 14, y + 24);
    }

    // Digital Watts Readout
    const fontSizeWatts = Math.min(36, Math.max(26, Math.floor(width * 0.16)));
    ctx.font = `700 ${fontSizeWatts}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isOverload ? '#ff4d4d' : '#f0f6fc';
    ctx.fillText(`${Math.round(watts)}W`, x + width * 0.5, y + height * 0.38);

    // Hazard indicator sub-label
    ctx.font = '500 11px monospace';
    if (isOverload) {
      const flashText = Math.floor(timeSec * 6) % 2 === 0 ? '#ff7b72' : '#ffa198';
      ctx.fillStyle = flashText;
      ctx.fillText('▲ SURGE > 500W THRESHOLD', x + width * 0.5, y + height * 0.46);
    } else {
      ctx.fillStyle = '#8b949e';
      ctx.fillText('GRID THRESHOLD: 500W', x + width * 0.5, y + height * 0.46);
    }

    // Vertical / Horizontal Bar Graphic
    const barPad = 16;
    const barW = width - barPad * 2;
    const barH = 18;
    const barY = y + height * 0.56;

    // Track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    this.roundRect(ctx, x + barPad, barY, barW, barH, 4);
    ctx.fill();

    // 500W limit marker line
    const maxScaleW = 700;
    const thresholdX = x + barPad + (500 / maxScaleW) * barW;
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, barY - 6);
    ctx.lineTo(thresholdX, barY + barH + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill bar
    const fillRatio = Math.min(1, Math.max(0, watts / maxScaleW));
    const fillWidth = barW * fillRatio;
    const barGradient = ctx.createLinearGradient(x + barPad, 0, x + barPad + fillWidth, 0);

    if (watts < 500) {
      barGradient.addColorStop(0, '#e3b341');
      barGradient.addColorStop(1, '#f0883e');
    } else {
      barGradient.addColorStop(0, '#f0883e');
      barGradient.addColorStop(0.7, '#f85149');
      barGradient.addColorStop(1, '#ff1a1a');
    }

    ctx.fillStyle = barGradient;
    this.roundRect(ctx, x + barPad, barY, fillWidth, barH, 4);
    ctx.fill();

    // Stress Waves / Hazard Striping inside active surge
    if (isOverload) {
      ctx.save();
      this.roundRect(ctx, x + barPad, barY, fillWidth, barH, 4);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3;
      const stripeOffset = (timeSec * 60) % 20;
      for (let sx = -20; sx < barW + 40; sx += 14) {
        ctx.beginPath();
        ctx.moveTo(x + barPad + sx + stripeOffset, barY - 5);
        ctx.lineTo(x + barPad + sx + stripeOffset - 15, barY + barH + 5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Dynamic wave oscillation graph in lower section
    const graphY = y + height * 0.72;
    const graphH = height * 0.20;
    const graphW = width - barPad * 2;
    const graphX = x + barPad;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(graphX, graphY, graphW, graphH);

    ctx.beginPath();
    for (let gx = 0; gx <= graphW; gx += 2) {
      const normGx = gx / graphW;
      const waveFreq = isOverload ? 0.3 : 0.08;
      const amp = isOverload ? (12 + Math.sin(normGx * 8 + timeSec * 15) * 8) : 4;
      const waveVal = Math.sin((gx * waveFreq) + timeSec * 18) * amp;
      const py = graphY + graphH * 0.5 + waveVal;
      if (gx === 0) ctx.moveTo(graphX + gx, py);
      else ctx.lineTo(graphX + gx, py);
    }
    ctx.strokeStyle = isOverload ? '#f85149' : '#d29922';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  drawRightStableMeter(ctx, x, y, width, height, watts, timeSec) {
    // Stable green boundary styling
    const glowAlpha = 0.5 + Math.sin(timeSec * 3) * 0.15;

    ctx.save();
    // Glowing stable boundary frame
    ctx.shadowColor = 'rgba(63, 185, 80, 0.4)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(63, 185, 80, ${glowAlpha})`;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(13, 28, 20, 0.75)';

    this.roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    // Clear shadow for crisp inner elements
    ctx.shadowBlur = 0;

    // Interior calm boundary accent line
    ctx.strokeStyle = 'rgba(63, 185, 80, 0.25)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x + 6, y + 6, width - 12, height - 12, 6);
    ctx.stroke();

    // Card Header
    ctx.fillStyle = '#7ee787';
    ctx.font = '600 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('OPTIMIZED EDGE', x + 16, y + 24);

    // Status Pill
    ctx.textAlign = 'right';
    ctx.fillStyle = '#3fb950';
    ctx.fillText('● EFFICIENT (35W)', x + width - 16, y + 24);

    // Digital Watts Readout
    const fontSizeWatts = Math.min(36, Math.max(26, Math.floor(width * 0.16)));
    ctx.font = `700 ${fontSizeWatts}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#56d364';
    ctx.fillText(`${watts.toFixed(1)}W`, x + width * 0.5, y + height * 0.38);

    // Sub-label
    ctx.font = '500 11px monospace';
    ctx.fillStyle = '#7ee787';
    ctx.fillText('STABLE GREEN BOUNDARY', x + width * 0.5, y + height * 0.46);

    // Bar Graphic
    const barPad = 16;
    const barW = width - barPad * 2;
    const barH = 18;
    const barY = y + height * 0.56;

    // Track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    this.roundRect(ctx, x + barPad, barY, barW, barH, 4);
    ctx.fill();

    // 500W relative scale marker for comparison
    const maxScaleW = 700;
    const thresholdX = x + barPad + (500 / maxScaleW) * barW;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(thresholdX, barY - 4);
    ctx.lineTo(thresholdX, barY + barH + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill bar for 35W (compact, clean emerald)
    const fillRatio = Math.min(1, Math.max(0, watts / maxScaleW));
    const fillWidth = Math.max(6, barW * fillRatio);

    const greenGradient = ctx.createLinearGradient(x + barPad, 0, x + barPad + fillWidth, 0);
    greenGradient.addColorStop(0, '#238636');
    greenGradient.addColorStop(1, '#3fb950');

    ctx.fillStyle = greenGradient;
    this.roundRect(ctx, x + barPad, barY, fillWidth, barH, 4);
    ctx.fill();

    // Stable, calm sine wave in lower section
    const graphY = y + height * 0.72;
    const graphH = height * 0.20;
    const graphW = width - barPad * 2;
    const graphX = x + barPad;

    ctx.strokeStyle = 'rgba(63, 185, 80, 0.18)';
    ctx.strokeRect(graphX, graphY, graphW, graphH);

    // Smooth baseline wave
    ctx.beginPath();
    for (let gx = 0; gx <= graphW; gx += 2) {
      const waveVal = Math.sin((gx * 0.05) - timeSec * 3) * 3;
      const py = graphY + graphH * 0.5 + waveVal;
      if (gx === 0) ctx.moveTo(graphX + gx, py);
      else ctx.lineTo(graphX + gx, py);
    }
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sustainable lock badge
    ctx.fillStyle = '#238636';
    ctx.font = '600 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HARMONIC GRID RESONANCE', x + width * 0.5, graphY + graphH + 13);

    ctx.restore();
  }

  drawFooterMetrics(ctx, centerX, y, leftW, rightW) {
    const ratio = (leftW / Math.max(1, rightW)).toFixed(1);
    ctx.font = '600 12px monospace';
    ctx.textAlign = 'center';

    // Left portion
    ctx.fillStyle = leftW >= 500 ? '#ff7b72' : '#d29922';
    ctx.fillText(`GRID DEMAND: ${Math.round(leftW)}W`, centerX - 120, y);

    // Separator / Delta
    ctx.fillStyle = '#e6edf3';
    ctx.fillText(`[ ${ratio}× EFFICIENCY RATIO ]`, centerX, y);

    // Right portion
    ctx.fillStyle = '#3fb950';
    ctx.fillText(`SUSTAINABLE TARGET: 35W`, centerX + 120, y);
  }

  roundRect(ctx, x, y, width, height, radius) {
    if (width <= 0 || height <= 0) return;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
