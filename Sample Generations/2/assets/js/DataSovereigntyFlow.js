class DataSovereigntyFlow {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this._handleResize = this._handleResize.bind(this);
  }

  mount(container) {
    this.unmount();
    this.container = container;

    // Outer wrapper for responsive containment
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.backgroundColor = '#0d1117';
    this.canvas.style.userSelect = 'none';

    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._handleResize();
    window.addEventListener('resize', this._handleResize);
  }

  unmount() {
    window.removeEventListener('resize', this._handleResize);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }

  _handleResize() {
    if (!this.canvas || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(rect.width, 320);
    this.height = Math.max(rect.height, 420);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  render(localTimeMs) {
    if (!this.ctx || !this.canvas) return;

    const t = Math.max(0, localTimeMs) / 1000;
    const ctx = this.ctx;
    const dpr = this.dpr;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Coordinate scaling based on a virtual 860 x 560 layout
    const baseW = 860;
    const baseH = 560;
    const scale = Math.min(this.width / baseW, this.height / baseH);
    const offsetX = (this.width - baseW * scale) / 2;
    const offsetY = (this.height - baseH * scale) / 2;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(offsetX, offsetY);

    // Background backdrop & subtle technical grid
    this._drawGrid(ctx, baseW, baseH);

    // Dividing boundary between top and bottom track
    this._drawTrackDivider(ctx, baseW, baseH);

    // Top Track: Centralized Cross-Ocean Silo Route
    this._drawTopTrack(ctx, baseW, baseH, t);

    // Bottom Track: Encrypted Local Sovereign Enclave
    this._drawBottomTrack(ctx, baseW, baseH, t);

    ctx.restore();
  }

  _drawGrid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const step = 28;
    ctx.beginPath();
    for (let x = 0; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  _drawTrackDivider(ctx, w, h) {
    const midY = h * 0.48;
    ctx.save();
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.9)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, midY);
    ctx.lineTo(w - 24, midY);
    ctx.stroke();

    // Small divider tag
    ctx.setLineDash([]);
    ctx.fillStyle = '#484f58';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('DATA GOVERNANCE ARCHITECTURE COMPARISON', w - 30, midY - 6);
    ctx.restore();
  }

  _drawTopTrack(ctx, w, h, t) {
    const yTrack = 125;
    const leftX = 120;
    const rightX = w - 120;

    // Track Title & Badges
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ff7b72';
    ctx.textAlign = 'left';
    ctx.fillText('CROSS-OCEAN EXTRACTION  [CENTRALIZED CLOUD ROUTE]', 32, 38);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText('STATUS: EXPOSED TO TRANSIT JURISDICTIONS & THIRD PARTIES', 32, 54);

    // Ocean WAN water wave graphic in between
    this._drawOceanTransit(ctx, leftX + 50, rightX - 60, yTrack, t);

    // Left Node: Local Biometric Clinic / Capture Node
    this._drawClinicNode(ctx, leftX, yTrack, 'PATIENT CLINIC', 'Unshielded Outbound');

    // Right Node: Mega Remote Central Silo
    this._drawCentralServerSilo(ctx, rightX, yTrack, t);

    // Data packets streaming across ocean
    this._drawVulnerablePackets(ctx, leftX + 45, rightX - 55, yTrack, t);
  }

  _drawOceanTransit(ctx, startX, endX, y, t) {
    ctx.save();
    const length = endX - startX;

    // Cable line
    ctx.strokeStyle = 'rgba(255, 123, 114, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    // Subsea waves
    ctx.strokeStyle = 'rgba(56, 139, 253, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += 4) {
      const wave = Math.sin((x - startX) * 0.05 - t * 2.5) * 8;
      if (x === startX) ctx.moveTo(x, y + 26 + wave);
      else ctx.lineTo(x, y + 26 + wave);
    }
    ctx.stroke();

    // Ocean transit labels & intercept markers
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(139, 148, 158, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('TRANS-OCEANIC WAN FIBER (LATENCY ~140ms)', startX + length / 2, y - 28);

    // Interception / Exposure risk tags along the cable
    const pulseWarn = (Math.sin(t * 3.5) + 1) / 2;
    ctx.fillStyle = `rgba(255, 123, 114, ${0.4 + pulseWarn * 0.5})`;
    ctx.fillText('! FOREIGN ACCESS RISK !', startX + length * 0.52, y + 46);

    ctx.restore();
  }

  _drawClinicNode(ctx, x, y, title, subtitle) {
    ctx.save();
    // Clinic Base box
    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 42, y - 42, 84, 84, 8);
    ctx.fill();
    ctx.stroke();

    // Biometric Heartbeat / Fingerprint Pulse icon
    ctx.strokeStyle = '#ff7b72';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 22, y);
    ctx.lineTo(x - 12, y);
    ctx.lineTo(x - 6, y - 16);
    ctx.lineTo(x + 2, y + 16);
    ctx.lineTo(x + 8, y - 8);
    ctx.lineTo(x + 14, y);
    ctx.lineTo(x + 22, y);
    ctx.stroke();

    // Sensor label
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#c9d1d9';
    ctx.textAlign = 'center';
    ctx.fillText(title, x, y + 58);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(subtitle, x, y + 71);
    ctx.restore();
  }

  _drawCentralServerSilo(ctx, x, y, t) {
    ctx.save();
    // Large Server Silo Icon (stacked disk racks)
    const siloW = 76;
    const siloH = 92;
    const topY = y - siloH / 2;

    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - siloW / 2, topY, siloW, siloH, 6);
    ctx.fill();
    ctx.stroke();

    // Rack slots & blinking data lights
    for (let i = 0; i < 4; i++) {
      const slotY = topY + 12 + i * 19;
      ctx.fillStyle = '#21262d';
      ctx.fillRect(x - siloW / 2 + 8, slotY, siloW - 16, 12);

      // Blinking LEDs
      const blink1 = Math.sin(t * 5 + i) > 0 ? '#ff7b72' : '#30363d';
      const blink2 = Math.cos(t * 4 + i) > 0 ? '#e3b341' : '#30363d';

      ctx.fillStyle = blink1;
      ctx.beginPath();
      ctx.arc(x - siloW / 2 + 15, slotY + 6, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = blink2;
      ctx.beginPath();
      ctx.arc(x - siloW / 2 + 23, slotY + 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Top warning antenna / corporate cloud ownership mark
    ctx.fillStyle = '#f85149';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('REMOTE SILO', x, topY - 8);

    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#c9d1d9';
    ctx.fillText('CORPORATE CLOUD', x, y + 62);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#f85149';
    ctx.fillText('Data Monopolized', x, y + 75);

    ctx.restore();
  }

  _drawVulnerablePackets(ctx, startX, endX, y, t) {
    ctx.save();
    const packetTypes = ['ECG_VITALS', 'DNA_LOCI', 'BIOMETRIC_ID', 'GLUCOSE_RAW'];
    const totalDist = endX - startX;
    const numPackets = 5;

    for (let i = 0; i < numPackets; i++) {
      // Loop packets continuously
      const progress = ((t * 0.28 + i / numPackets) % 1);
      const px = startX + progress * totalDist;
      const py = y + Math.sin(progress * Math.PI * 4 + t) * 4;

      // Packet body
      ctx.fillStyle = 'rgba(255, 123, 114, 0.9)';
      ctx.shadowColor = '#ff7b72';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(px - 14, py - 8, 28, 16, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner data pulse
      ctx.fillStyle = '#0d1117';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(packetTypes[i % packetTypes.length].slice(0, 5), px, py + 2.5);

      // Leaking data trail (unencrypted risk)
      ctx.strokeStyle = 'rgba(255, 123, 114, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 14, py);
      ctx.lineTo(px - 26, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawBottomTrack(ctx, w, h, t) {
    const bottomMidY = 390;
    const terminalX = w * 0.5;

    // Track Title & Badges
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#58a6ff';
    ctx.textAlign = 'left';
    ctx.fillText('SELF-SOVEREIGN LOCAL ENCLAVE  [EDGE ZERO-EXPORT ARCHITECTURE]', 32, 280);

    // Lock condition: locks at exactly 4.0 seconds
    const locked = t >= 4.0;
    const lockAge = Math.max(0, t - 4.0);

    ctx.font = '11px monospace';
    if (locked) {
      ctx.fillStyle = '#39d353';
      ctx.fillText('STATUS: LOCKED & SECURED ON-PREMISES (ZERO OVERSEAS TRANSIT)', 32, 296);
    } else {
      const countdown = Math.max(0, 4.0 - t).toFixed(1);
      ctx.fillStyle = '#e3b341';
      ctx.fillText(`STATUS: INITIALIZING ENCLAVE BOUNDARY (LOCKING IN ${countdown}s)...`, 32, 296);
    }

    // Local Terminal Station
    this._drawModularTerminal(ctx, terminalX, bottomMidY, t, locked);

    // Patient records spinning / circulating strictly inside local terminal
    this._drawLocalDataLoops(ctx, terminalX, bottomMidY, t);

    // Glowing Cyan Shield around enclave
    this._drawSovereigntyShield(ctx, terminalX, bottomMidY, t, locked, lockAge);

    // Inbound rogue probing network packets deflecting off shield
    this._drawDeflectedProbes(ctx, terminalX, bottomMidY, t, locked);
  }

  _drawModularTerminal(ctx, cx, cy, t, locked) {
    ctx.save();
    // Hardware chassis
    const tw = 170;
    const th = 110;

    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = locked ? '#00f0ff' : '#30363d';
    ctx.lineWidth = locked ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, 10);
    ctx.fill();
    ctx.stroke();

    // Terminal Screen
    const sw = tw - 24;
    const sh = th - 44;
    ctx.fillStyle = '#090d13';
    ctx.fillRect(cx - sw / 2, cy - th / 2 + 12, sw, sh);

    // Dynamic terminal display lines
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    if (locked) {
      ctx.fillStyle = '#00f0ff';
      ctx.fillText('ENCLAVE ID: ISO-9092-LOC', cx - sw / 2 + 8, cy - 24);
      ctx.fillStyle = '#56d364';
      ctx.fillText('TRANSIT BUS: SEVERED [OFF]', cx - sw / 2 + 8, cy - 10);
      ctx.fillStyle = '#79c0ff';
      ctx.fillText('ENCRYPTION: AES-256-GCM', cx - sw / 2 + 8, cy + 4);
      ctx.fillStyle = '#39d353';
      ctx.fillText('HEALTH LOG: 100% SOVEREIGN', cx - sw / 2 + 8, cy + 18);
    } else {
      ctx.fillStyle = '#e3b341';
      ctx.fillText('ENCLAVE: BOOTING KERNEL', cx - sw / 2 + 8, cy - 24);
      ctx.fillStyle = '#8b949e';
      ctx.fillText('SYNCING EPHEMERAL KEYS...', cx - sw / 2 + 8, cy - 10);
      const barLen = Math.min(sw - 16, ((t / 4.0) * (sw - 16)));
      ctx.fillStyle = 'rgba(227, 179, 65, 0.4)';
      ctx.fillRect(cx - sw / 2 + 8, cy + 2, sw - 16, 6);
      ctx.fillStyle = '#e3b341';
      ctx.fillRect(cx - sw / 2 + 8, cy + 2, barLen, 6);
      ctx.fillText('ARMING HARDWARE ENCLAVE', cx - sw / 2 + 8, cy + 20);
    }

    // Terminal base label
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b949e';
    ctx.fillText('LOCAL MODULAR TERMINAL', cx, cy + th / 2 + 20);

    ctx.restore();
  }

  _drawLocalDataLoops(ctx, cx, cy, t) {
    ctx.save();
    // Inner secure orbits of patient health telemetry
    const rx = 65;
    const ry = 36;
    const numOrbits = 3;

    for (let i = 0; i < numOrbits; i++) {
      const angle = t * 1.8 + (i * Math.PI * 2) / numOrbits;
      const ox = cx + Math.cos(angle) * rx;
      const oy = cy + Math.sin(angle) * ry;

      // Small glowing green / cyan records
      ctx.fillStyle = '#39d353';
      ctx.shadowColor = '#39d353';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawSovereigntyShield(ctx, cx, cy, t, locked, lockAge) {
    ctx.save();
    const radius = 138;

    if (!locked) {
      // Shield forming up to 4s: circular arc closing with dashed guide
      const progress = Math.min(1, t / 4.0);
      const sweepAngle = progress * Math.PI * 2;

      // Background target perimeter
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Sweeping arc
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + sweepAngle);
      ctx.stroke();

      // Rotating calibration reticle
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;
      this._drawHexagon(ctx, cx, cy, radius * (0.85 + 0.1 * Math.sin(t * 4)), t * 0.5);

      // Progress readout banner
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'center';
      ctx.fillText(`CONFIGURING ENCLAVE BOUNDARY (${Math.floor(progress * 100)}%)`, cx, cy - radius - 14);

    } else {
      // Locked State at t >= 4.0s
      // Instant flash / shockwave right at 4s
      if (lockAge < 1.2) {
        const shockRadius = radius + lockAge * 60;
        const alpha = Math.max(0, 1 - lockAge / 1.2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
        ctx.lineWidth = 4 * alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, shockRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Continuous rhythmic shield breathing glow
      const breathe = (Math.sin(t * 3) + 1) * 0.5;
      const glowAlpha = 0.55 + breathe * 0.35;

      // Outer glow aura
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 18 + breathe * 12;

      // Hexagonal outer forcefield
      ctx.strokeStyle = `rgba(0, 240, 255, ${glowAlpha})`;
      ctx.lineWidth = 2.5;
      this._drawHexagon(ctx, cx, cy, radius, 0);

      // Inner faint secondary hex
      ctx.strokeStyle = `rgba(0, 240, 255, ${0.2 + breathe * 0.15})`;
      ctx.lineWidth = 1;
      this._drawHexagon(ctx, cx, cy, radius - 12, t * 0.2);

      ctx.shadowBlur = 0;

      // Hex grid lattice segments on perimeter
      for (let i = 0; i < 6; i++) {
        const rad = (Math.PI / 3) * i;
        const px = cx + Math.cos(rad) * radius;
        const py = cy + Math.sin(rad) * radius;
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Lock Badge Header at top of enclave
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHIELD ENCLAVE ACTIVE // LOCKED [4.00s]', cx, cy - radius - 14);

      // Padlock icon on the shield apex
      this._drawLockIcon(ctx, cx, cy - radius, '#00f0ff');
    }

    ctx.restore();
  }

  _drawHexagon(ctx, x, y, r, rotation) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = rotation + (Math.PI / 3) * i;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }

  _drawLockIcon(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = '#0d1117';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // Outer backing plate
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Lock body
    ctx.fillStyle = color;
    ctx.fillRect(x - 5, y - 2, 10, 7);

    // Lock shackle
    ctx.beginPath();
    ctx.arc(x, y - 2, 4, Math.PI, 0, false);
    ctx.stroke();
    ctx.restore();
  }

  _drawDeflectedProbes(ctx, cx, cy, t, locked) {
    if (!locked) return;
    ctx.save();

    // Periodic external data requests pinging from the outside, deflecting away
    const probes = [
      { seed: 0, speed: 1.1, angle: -0.25 },
      { seed: 2.2, speed: 1.4, angle: 0.15 },
      { seed: 4.5, speed: 0.9, angle: -0.55 }
    ];

    const shieldR = 138;

    probes.forEach(p => {
      const probeCycle = ((t + p.seed) * p.speed) % 3.0;
      if (probeCycle < 1.4) {
        // Approaching from right
        const progress = probeCycle / 1.4;
        const currDist = 340 - progress * (340 - shieldR);
        const px = cx + Math.cos(p.angle) * currDist;
        const py = cy + Math.sin(p.angle) * currDist;

        ctx.fillStyle = '#f85149';
        ctx.shadowColor = '#f85149';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(248, 81, 73, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 10, py);
        ctx.lineTo(px, py);
        ctx.stroke();
      } else if (probeCycle < 2.0) {
        // Deflection bounce & sparks at boundary
        const bounceProg = (probeCycle - 1.4) / 0.6;
        const bounceDist = shieldR + bounceProg * 45;
        const bounceAngle = p.angle + 0.3 * bounceProg;
        const bx = cx + Math.cos(bounceAngle) * bounceDist;
        const by = cy + Math.sin(bounceAngle) * bounceDist;

        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(bx, by, 3 * (1 - bounceProg * 0.5), 0, Math.PI * 2);
        ctx.fill();

        // Bounce Spark burst
        ctx.strokeStyle = `rgba(0, 240, 255, ${1 - bounceProg})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 14 * bounceProg, by - 10 * bounceProg);
        ctx.stroke();
      }
    });

    ctx.restore();
  }
}
