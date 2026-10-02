class EnergyWattageComparisonAnim {
  constructor() {
    this.container = null;
    this.root = null;
    this.elements = {};
  }

  mount(container) {
    if (this.root && this.container) {
      this.unmount();
    }
    this.container = container;

    // Root wrapper
    const root = document.createElement('div');
    root.style.width = '100%';
    root.style.maxWidth = '840px';
    root.style.minHeight = '360px';
    root.style.margin = '0 auto';
    root.style.padding = '20px';
    root.style.boxSizing = 'border-box';
    root.style.backgroundColor = '#0d1117';
    root.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif';
    root.style.color = '#e6edf3';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '16px';
    root.style.userSelect = 'none';
    this.root = root;

    // Header bar
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid #30363d';
    header.style.paddingBottom = '10px';

    const title = document.createElement('div');
    title.style.fontSize = '14px';
    title.style.fontWeight = '700';
    title.style.letterSpacing = '1.2px';
    title.style.textTransform = 'uppercase';
    title.style.color = '#8b949e';
    title.textContent = 'Power Load & Grid Dynamics';

    const timeBadge = document.createElement('div');
    timeBadge.style.fontSize = '12px';
    timeBadge.style.fontFamily = 'monospace';
    timeBadge.style.padding = '4px 8px';
    timeBadge.style.borderRadius = '4px';
    timeBadge.style.backgroundColor = '#161b22';
    timeBadge.style.border = '1px solid #30363d';
    timeBadge.textContent = 'T +0.00s';
    this.elements.timeBadge = timeBadge;

    header.appendChild(title);
    header.appendChild(timeBadge);
    root.appendChild(header);

    // Cards Grid
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    grid.style.gap = '16px';

    // LEFT CARD: 600W Heavy Spiking Load
    const leftCard = this._createCard('TRADITIONAL HEAVY COMPUTE', '#ff7b72');
    leftCard.card.style.background = 'radial-gradient(ellipse at top, rgba(248,81,73,0.08), #161b22 70%)';
    leftCard.card.style.borderColor = '#490202';
    this.elements.leftCard = leftCard.card;

    // Dial SVG Left (0 - 750W)
    const leftDialObj = this._createDialSvg(750, '#f85149', 'CRITICAL OVERLOAD: 600W+');
    leftCard.body.appendChild(leftDialObj.svg);
    this.elements.leftNeedle = leftDialObj.needle;
    this.elements.leftFillArc = leftDialObj.fillArc;
    this.elements.leftValueText = leftDialObj.valueText;

    // Warning Banner & Instability indicator
    const alertBox = document.createElement('div');
    alertBox.style.display = 'flex';
    alertBox.style.alignItems = 'center';
    alertBox.style.justifyContent = 'space-between';
    alertBox.style.padding = '8px 12px';
    alertBox.style.borderRadius = '6px';
    alertBox.style.backgroundColor = 'rgba(248, 81, 73, 0.15)';
    alertBox.style.border = '1px solid #f85149';
    alertBox.style.marginTop = '8px';
    alertBox.style.transition = 'background-color 0.1s, border-color 0.1s';

    const alertStatus = document.createElement('div');
    alertStatus.style.fontSize = '11px';
    alertStatus.style.fontWeight = '700';
    alertStatus.style.color = '#ff7b72';
    alertStatus.style.letterSpacing = '0.5px';
    alertStatus.textContent = 'GRID STATUS: NOMINAL';
    this.elements.alertStatus = alertStatus;

    // Jagged grid instability waveform SVG
    const waveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    waveSvg.setAttribute('viewBox', '0 0 100 24');
    waveSvg.setAttribute('width', '80');
    waveSvg.setAttribute('height', '20');
    const wavePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wavePath.setAttribute('d', 'M 0 12 Q 25 12 50 12 T 100 12');
    wavePath.setAttribute('fill', 'none');
    wavePath.setAttribute('stroke', '#ff7b72');
    wavePath.setAttribute('stroke-width', '2');
    wavePath.setAttribute('stroke-linecap', 'round');
    waveSvg.appendChild(wavePath);
    alertBox.appendChild(alertStatus);
    alertBox.appendChild(waveSvg);
    leftCard.body.appendChild(alertBox);
    this.elements.alertBox = alertBox;
    this.elements.wavePath = wavePath;

    // Left metrics readout
    const leftMetrics = document.createElement('div');
    leftMetrics.style.display = 'flex';
    leftMetrics.style.justifyContent = 'space-between';
    leftMetrics.style.fontSize = '11px';
    leftMetrics.style.color = '#8b949e';
    leftMetrics.style.marginTop = '8px';
    leftMetrics.style.fontFamily = 'monospace';
    leftMetrics.innerHTML = '<span>LINE LOSS: <b id="left-loss" style="color:#f85149">14.2%</b></span><span>TEMP: <b id="left-temp" style="color:#f85149">84°C</b></span>';
    leftCard.body.appendChild(leftMetrics);
    this.elements.leftTemp = leftMetrics.querySelector('#left-temp');
    this.elements.leftLoss = leftMetrics.querySelector('#left-loss');

    // RIGHT CARD: 65W Efficient Steady Load
    const rightCard = this._createCard('EDGE SUSTAINABLE ARCHITECTURE', '#3fb950');
    rightCard.card.style.background = 'radial-gradient(ellipse at top, rgba(63,185,80,0.08), #161b22 70%)';
    rightCard.card.style.borderColor = '#134e27';

    // Dial SVG Right (0 - 150W)
    const rightDialObj = this._createDialSvg(150, '#2ea043', 'TARGET STABILITY: 65W');
    rightCard.body.appendChild(rightDialObj.svg);
    this.elements.rightNeedle = rightDialObj.needle;
    this.elements.rightFillArc = rightDialObj.fillArc;
    this.elements.rightValueText = rightDialObj.valueText;

    // Solar + Battery Subsystem Bar
    const greenEcoBox = document.createElement('div');
    greenEcoBox.style.display = 'flex';
    greenEcoBox.style.alignItems = 'center';
    greenEcoBox.style.justifyContent = 'space-between';
    greenEcoBox.style.padding = '8px 12px';
    greenEcoBox.style.borderRadius = '6px';
    greenEcoBox.style.backgroundColor = 'rgba(46, 160, 67, 0.15)';
    greenEcoBox.style.border = '1px solid #2ea043';
    greenEcoBox.style.marginTop = '8px';

    // Solar panel icon SVG
    const solarWrap = document.createElement('div');
    solarWrap.style.display = 'flex';
    solarWrap.style.alignItems = 'center';
    solarWrap.style.gap = '6px';
    const solarSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    solarSvg.setAttribute('viewBox', '0 0 24 24');
    solarSvg.setAttribute('width', '20');
    solarSvg.setAttribute('height', '20');
    solarSvg.innerHTML = `
      <circle cx="12" cy="5" r="2.5" fill="#f2cc60" />
      <path d="M 4 20 L 7 11 L 17 11 L 20 20 Z" fill="none" stroke="#56d364" stroke-width="1.6"/>
      <path d="M 12 11 L 12 20 M 5.5 15.5 L 18.5 15.5" stroke="#56d364" stroke-width="1.2"/>
    `;
    const solarText = document.createElement('span');
    solarText.style.fontSize = '11px';
    solarText.style.fontWeight = '700';
    solarText.style.color = '#56d364';
    solarText.textContent = 'SOLAR: +72W';
    solarWrap.appendChild(solarSvg);
    solarWrap.appendChild(solarText);
    this.elements.solarText = solarText;
    this.elements.solarSvg = solarSvg;

    // Battery Bank Display
    const batteryWrap = document.createElement('div');
    batteryWrap.style.display = 'flex';
    batteryWrap.style.alignItems = 'center';
    batteryWrap.style.gap = '4px';

    const battCells = [];
    for (let i = 0; i < 4; i++) {
      const cell = document.createElement('div');
      cell.style.width = '7px';
      cell.style.height = '14px';
      cell.style.borderRadius = '2px';
      cell.style.backgroundColor = '#238636';
      cell.style.transition = 'opacity 0.2s, background-color 0.2s';
      batteryWrap.appendChild(cell);
      battCells.push(cell);
    }
    const battCap = document.createElement('div');
    battCap.style.width = '3px';
    battCap.style.height = '6px';
    battCap.style.backgroundColor = '#30363d';
    battCap.style.borderRadius = '0 2px 2px 0';
    batteryWrap.appendChild(battCap);
    this.elements.battCells = battCells;

    greenEcoBox.appendChild(solarWrap);
    greenEcoBox.appendChild(batteryWrap);
    rightCard.body.appendChild(greenEcoBox);

    // Right metrics readout
    const rightMetrics = document.createElement('div');
    rightMetrics.style.display = 'flex';
    rightMetrics.style.justifyContent = 'space-between';
    rightMetrics.style.fontSize = '11px';
    rightMetrics.style.color = '#8b949e';
    rightMetrics.style.marginTop = '8px';
    rightMetrics.style.fontFamily = 'monospace';
    rightMetrics.innerHTML = '<span>LINE BAL: <b style="color:#56d364">100% OFF-GRID</b></span><span>BATTERY: <b id="batt-pct" style="color:#56d364">94% CHG</b></span>';
    rightCard.body.appendChild(rightMetrics);
    this.elements.battPct = rightMetrics.querySelector('#batt-pct');

    grid.appendChild(leftCard.card);
    grid.appendChild(rightCard.card);
    root.appendChild(grid);

    container.appendChild(root);
  }

  _createCard(titleText, accentColor) {
    const card = document.createElement('div');
    card.style.backgroundColor = '#161b22';
    card.style.border = '1px solid #30363d';
    card.style.borderRadius = '8px';
    card.style.padding = '14px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.position = 'relative';
    card.style.overflow = 'hidden';

    const heading = document.createElement('div');
    heading.style.fontSize = '11px';
    heading.style.fontWeight = '700';
    heading.style.letterSpacing = '0.8px';
    heading.style.color = accentColor;
    heading.style.marginBottom = '6px';
    heading.textContent = titleText;

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.position = 'relative';

    card.appendChild(heading);
    card.appendChild(body);
    return { card, body };
  }

  _createDialSvg(maxVal, arcColor, thresholdLabel) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 120');
    svg.style.width = '100%';
    svg.style.maxHeight = '140px';

    // Defs & Gradients
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradId = 'grad-' + Math.random().toString(36).substr(2, 9);
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');
    grad.innerHTML = `<stop offset="0%" stop-color="#30363d"/><stop offset="100%" stop-color="${arcColor}"/>`;
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Track arc (semi-circle radius 70, center 100, 100)
    // Arc from angle -180° to 0°
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    track.setAttribute('d', 'M 30 100 A 70 70 0 0 1 170 100');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', '#21262d');
    track.setAttribute('stroke-width', '14');
    track.setAttribute('stroke-linecap', 'round');
    svg.appendChild(track);

    // Active fill arc
    const fillArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fillArc.setAttribute('d', 'M 30 100 A 70 70 0 0 1 170 100');
    fillArc.setAttribute('fill', 'none');
    fillArc.setAttribute('stroke', `url(#${gradId})`);
    fillArc.setAttribute('stroke-width', '14');
    fillArc.setAttribute('stroke-linecap', 'round');
    // Circumference of semi-circle = Math.PI * 70 ≈ 219.91
    fillArc.setAttribute('stroke-dasharray', '220');
    fillArc.setAttribute('stroke-dashoffset', '220');
    svg.appendChild(fillArc);

    // Center pivot & needle
    const needleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    needleGroup.style.transformOrigin = '100px 100px';

    const needle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    needle.setAttribute('points', '96,100 100,32 104,100');
    needle.setAttribute('fill', '#f0f6fc');
    needle.setAttribute('filter', 'drop-shadow(0 0 3px rgba(0,0,0,0.8))');
    needleGroup.appendChild(needle);

    const pin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pin.setAttribute('cx', '100');
    pin.setAttribute('cy', '100');
    pin.setAttribute('r', '7');
    pin.setAttribute('fill', '#c9d1d9');
    needleGroup.appendChild(pin);

    svg.appendChild(needleGroup);

    // Text Display inside dial
    const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    valueText.setAttribute('x', '100');
    valueText.setAttribute('y', '92');
    valueText.setAttribute('text-anchor', 'middle');
    valueText.setAttribute('font-size', '20');
    valueText.setAttribute('font-weight', '800');
    valueText.setAttribute('font-family', 'monospace');
    valueText.setAttribute('fill', '#f0f6fc');
    valueText.textContent = '0 W';
    svg.appendChild(valueText);

    // Sub label
    const subLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subLabel.setAttribute('x', '100');
    subLabel.setAttribute('y', '114');
    subLabel.setAttribute('text-anchor', 'middle');
    subLabel.setAttribute('font-size', '8');
    subLabel.setAttribute('font-weight', '600');
    subLabel.setAttribute('letter-spacing', '0.5');
    subLabel.setAttribute('fill', '#8b949e');
    subLabel.textContent = thresholdLabel;
    svg.appendChild(subLabel);

    return { svg, needle: needleGroup, fillArc, valueText };
  }

  render(localTimeMs) {
    if (!this.root) return;

    // 5-second cycle
    const cycleMs = 5000;
    const t = (localTimeMs % cycleMs) / 1000; // 0 to 5.0 seconds
    const el = this.elements;

    // Time readout
    el.timeBadge.textContent = `T +${t.toFixed(2)}s`;

    // 1. LEFT GAUGE COMPUTATION (600W Surge & Spikes)
    let leftW = 0;
    let jitter = 0;
    let isOverload = false;

    if (t < 1.0) {
      // Warm up ramp: 180W -> 420W
      const p = t / 1.0;
      leftW = 180 + p * 240 + Math.sin(t * 15) * 5;
    } else if (t < 2.2) {
      // Surge phase entering overload (420W -> 610W)
      const p = (t - 1.0) / 1.2;
      jitter = Math.sin(t * 45) * 12 + Math.cos(t * 80) * 8;
      leftW = 420 + p * 190 + jitter;
    } else if (t < 4.2) {
      // Violent Overload threshold spiking between 590W and 685W
      isOverload = true;
      jitter = Math.sin(t * 60) * 35 + Math.sin(t * 110) * 20;
      leftW = 620 + jitter;
    } else {
      // Thermal collapse / throttle recovery drop to 320W
      const p = (t - 4.2) / 0.8;
      jitter = Math.sin(t * 20) * 10;
      leftW = 620 - p * 300 + jitter;
    }

    leftW = Math.max(0, Math.min(750, leftW));

    // Dial Needle transform: -90deg is 0W, +90deg is 750W
    const leftFrac = leftW / 750;
    const leftAngle = -90 + leftFrac * 180;
    el.leftNeedle.style.transform = `rotate(${leftAngle}deg)`;

    // Stroke dashoffset: 220 full, 0 empty
    const leftOffset = 220 - leftFrac * 220;
    el.leftFillArc.setAttribute('stroke-dashoffset', leftOffset.toFixed(1));
    el.leftValueText.textContent = `${Math.round(leftW)} W`;

    // Overload UI reactions
    if (isOverload || leftW > 550) {
      const flash = Math.sin(t * 20) > 0;
      el.leftCard.style.boxShadow = flash ? '0 0 25px rgba(248, 81, 73, 0.45)' : 'none';
      el.leftCard.style.borderColor = flash ? '#f85149' : '#8e1519';
      el.alertStatus.textContent = 'CRITICAL: GRID OVERLOAD TRIP';
      el.alertStatus.style.color = flash ? '#ffffff' : '#ff7b72';
      el.alertBox.style.backgroundColor = flash ? 'rgba(248, 81, 73, 0.5)' : 'rgba(248, 81, 73, 0.2)';

      // Jitter wave line
      const j1 = 12 + Math.sin(t * 50) * 9;
      const j2 = 12 - Math.sin(t * 70) * 9;
      const j3 = 12 + Math.cos(t * 60) * 10;
      el.wavePath.setAttribute('d', `M 0 12 L 20 ${j1.toFixed(1)} L 45 ${j2.toFixed(1)} L 75 ${j3.toFixed(1)} L 100 12`);
      el.wavePath.setAttribute('stroke', '#ffffff');

      el.leftTemp.textContent = `${(85 + (leftW - 550) * 0.08).toFixed(1)}°C`;
      el.leftLoss.textContent = `${(18 + Math.random() * 4).toFixed(1)}%`;
    } else {
      el.leftCard.style.boxShadow = 'none';
      el.leftCard.style.borderColor = '#490202';
      el.alertStatus.textContent = 'LOAD ELEVATING...';
      el.alertStatus.style.color = '#ff7b72';
      el.alertBox.style.backgroundColor = 'rgba(248, 81, 73, 0.15)';
      el.wavePath.setAttribute('d', `M 0 12 Q 25 ${12 + Math.sin(t * 10) * 4} 50 12 T 100 12`);
      el.wavePath.setAttribute('stroke', '#ff7b72');

      el.leftTemp.textContent = `${(55 + (leftW / 750) * 30).toFixed(1)}°C`;
      el.leftLoss.textContent = '8.4%';
    }

    // 2. RIGHT GAUGE COMPUTATION (Steady 65W, Emerald Green)
    // Minor steady micro-fluctuation between 64.6W and 65.4W
    const rightW = 65.0 + Math.sin(t * 3.5) * 0.45;
    const rightFrac = rightW / 150;
    const rightAngle = -90 + rightFrac * 180;
    el.rightNeedle.style.transform = `rotate(${rightAngle}deg)`;

    const rightOffset = 220 - rightFrac * 220;
    el.rightFillArc.setAttribute('stroke-dashoffset', rightOffset.toFixed(1));
    el.rightValueText.textContent = `${rightW.toFixed(1)} W`;

    // Solar pulse and Battery cycle
    const solarGen = 72 + Math.sin(t * 2) * 3;
    el.solarText.textContent = `SOLAR: +${solarGen.toFixed(0)}W`;
    el.solarSvg.style.filter = `drop-shadow(0 0 ${4 + Math.sin(t * 4) * 2}px #f2cc60)`;

    // Battery bank charging cycle: fills across the 5s window
    // 0s (70%) -> 5s (98%)
    const battChargePercent = 70 + (t / 5) * 28;
    el.battPct.textContent = `${Math.round(battChargePercent)}% CHG`;

    // 4 battery segments: active based on charge level
    const activeCells = Math.min(4, Math.floor((battChargePercent - 60) / 9));
    const pulsePhase = Math.sin(t * 8) > 0;
    el.battCells.forEach((cell, idx) => {
      if (idx < activeCells - 1) {
        cell.style.backgroundColor = '#2ea043';
        cell.style.opacity = '1';
      } else if (idx === activeCells - 1) {
        // Charging tip cell pulses
        cell.style.backgroundColor = pulsePhase ? '#56d364' : '#238636';
        cell.style.opacity = '1';
      } else {
        cell.style.backgroundColor = '#21262d';
        cell.style.opacity = '0.5';
      }
    });
  }

  unmount() {
    if (this.root && this.container) {
      if (this.root.parentNode === this.container) {
        this.container.removeChild(this.root);
      }
    }
    this.root = null;
    this.container = null;
    this.elements = {};
  }
}
