// اپلیکیشن PWA محاسبه پایداری دیوار ساحلی
// توسعه‌دهنده: م.رضا پویا
// © تمامی حقوق این نرم‌افزار محفوظ است - 1403

// ثبت Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker ثبت شد:', reg))
            .catch(err => console.log('خطا در ثبت Service Worker:', err));
    });
}

// متغیرهای کلیدی محاسبات
let calculationResults = {
    normal: {},
    seismic: {}
};

// تبدیل درجه به رادیان
function toRad(degree) {
    return degree * Math.PI / 180;
}

// تبدیل رادیان به درجه
function toDeg(radian) {
    return radian * 180 / Math.PI;
}

// نمایش/پنهان کردن تب‌ها
function showTab(tabName) {
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    if (tabName === 'diagram') {
        setTimeout(() => drawWallDiagram(), 100);
    }
}

// تغییر نوع دیوار
function toggleWallType() {
    const wallType = document.getElementById('wallType').value;
    const slopedInputs = document.getElementById('slopedInputs');
    const steppedInputs = document.getElementById('steppedInputs');
    
    if (wallType === 'sloped') {
        slopedInputs.style.display = 'grid';
        steppedInputs.style.display = 'none';
    } else {
        slopedInputs.style.display = 'none';
        steppedInputs.style.display = 'grid';
    }
}

// محاسبه ضریب فشار فعال (رانکین)
function calculateKa(phi, beta, alpha) {
    const phi_rad = toRad(phi);
    const beta_rad = toRad(beta);
    const alpha_rad = toRad(alpha);
    
    const numerator = Math.cos(phi_rad - alpha_rad) ** 2;
    const denominator = Math.cos(alpha_rad) ** 2 * 
                        (Math.cos(alpha_rad + phi_rad) ** 2) * 
                        (1 + Math.sqrt(Math.sin(phi_rad) * Math.sin(phi_rad - beta_rad) / 
                                      (Math.cos(alpha_rad + phi_rad) * Math.cos(alpha_rad - beta_rad)))) ** 2;
    
    const Ka = numerator / denominator;
    return Ka;
}

// محاسبه ضریب فشار مقاوم (رانکین)
function calculateKp(phi, delta) {
    const phi_rad = toRad(phi);
    const delta_rad = toRad(delta);
    
    const Kp = Math.cos(delta_rad) ** 2 / 
               ((Math.cos(delta_rad) ** 2) * (Math.sin(phi_rad + delta_rad) ** 2) * 
                (1 - Math.sqrt(Math.sin(phi_rad) * Math.sin(phi_rad - delta_rad) / Math.sin(delta_rad))));
    
    return Kp;
}

// محاسبه ضریب فشار فعال لرزه‌ای
function calculateKae(phi, kh, beta) {
    const phi_rad = toRad(phi);
    const beta_rad = toRad(beta);
    const theta = Math.atan(kh / (1 - 0)); // فرض kv=0
    
    const numerator = Math.cos(phi_rad) ** 2;
    const denominator = Math.cos(theta) ** 2 * 
                        (Math.cos(beta_rad + theta) ** 2) * 
                        (1 + Math.sqrt(Math.sin(phi_rad + theta) * Math.sin(phi_rad - beta_rad) / 
                                      (Math.cos(beta_rad + theta)))) ** 2;
    
    const Kae = numerator / denominator;
    return Kae;
}

// محاسبه وزن دیوار
function calculateWallWeight(height, topThickness, baseWidth, masonryDensity, concreteDensity, wallType, stepCount, stepDepth) {
    let wallWeight = 0;
    let wallArea = 0;
    
    if (wallType === 'sloped') {
        // دیوار شیب‌دار: محاسبه به صورت ذوزنقه
        const bottomThickness = topThickness + (baseWidth - topThickness) * 0.6;
        wallArea = (topThickness + bottomThickness) / 2 * height;
    } else {
        // دیوار پله‌ای: محاسبه تقریبی
        wallArea = (height * baseWidth) * 0.7; // تقریب
    }
    
    wallWeight = wallArea * masonryDensity;
    
    // وزن پی
    const foundationHeight = 0.5; // فرض
    const foundationWeight = baseWidth * foundationHeight * concreteDensity;
    
    return wallWeight + foundationWeight;
}

// محاسبه فشار فعال
function calculateActiveForce(height, soilDensity, Ka, surcharge) {
    // Pa = 0.5 * γ * H^2 * Ka + q * H * Ka
    const pressureFromSoil = 0.5 * soilDensity * height ** 2 * Ka;
    const pressureFromSurcharge = surcharge * height * Ka;
    
    return {
        total: pressureFromSoil + pressureFromSurcharge,
        fromSoil: pressureFromSoil,
        fromSurcharge: pressureFromSurcharge,
        height: height / 3 // فاصله مرکز فشار از پایه
    };
}

// محاسبه گشتاور واژگونی
function calculateOverturningMoment(activeForce, height) {
    return activeForce.total * activeForce.height;
}

// محاسبه گشتاور پایدار‌کننده
function calculateResistingMoment(wallWeight, baseWidth) {
    return wallWeight * (baseWidth / 2);
}

// محاسبه ضریب اطمینان واژگونی
function calculateFOTipping(resistingMoment, overtturningMoment) {
    if (overtturningMoment === 0) return 10;
    return resistingMoment / overtturningMoment;
}

// محاسبه ضریب اطمینان لغزش
function calculateFOSlip(normalForce, frictionForce, horizontalForce) {
    if (horizontalForce === 0) return 10;
    return (normalForce * Math.tan(toRad(20)) + frictionForce) / horizontalForce;
}

// تابع اصلی محاسبه
function calculate() {
    // دریافت ورودی‌ها
    const inputs = {
        // هندسه
        wallHeight: parseFloat(document.getElementById('wallHeight').value),
        wallType: document.getElementById('wallType').value,
        backSlope: parseFloat(document.getElementById('backSlope').value),
        topThickness: parseFloat(document.getElementById('topThickness').value),
        stepCount: parseInt(document.getElementById('stepCount').value),
        stepDepth: parseFloat(document.getElementById('stepDepth').value),
        baseWidth: parseFloat(document.getElementById('baseWidth').value),
        foundationHeight: parseFloat(document.getElementById('foundationHeight').value),
        
        // مصالح
        masonryDensity: parseFloat(document.getElementById('masonryDensity').value),
        concreteDensity: parseFloat(document.getElementById('concreteDensity').value),
        
        // خاک
        soilDensity: parseFloat(document.getElementById('soilDensity').value),
        frictionAngle: parseFloat(document.getElementById('frictionAngle').value),
        cohesion: parseFloat(document.getElementById('cohesion').value),
        wallFriction: parseFloat(document.getElementById('wallFriction').value),
        
        // بارگذاری
        surfaceSlope: parseFloat(document.getElementById('surfaceSlope').value),
        surcharge: parseFloat(document.getElementById('surcharge').value),
        
        // لرزه‌ای
        seismicCoeff: parseFloat(document.getElementById('seismicCoeff').value),
        seismicCoeffV: parseFloat(document.getElementById('seismicCoeffV').value)
    };
    
    // اعتبارسنجی
    if (inputs.wallHeight <= 0 || inputs.baseWidth <= 0) {
        alert('لطفاً تمام ابعاد را به درستی وارد کنید');
        return;
    }
    
    // محاسبات حالت عادی
    const normalResults = performNormalAnalysis(inputs);
    
    // محاسبات حالت لرزه‌ای
    const seismicResults = performSeismicAnalysis(inputs);
    
    // ذخیره نتایج
    calculationResults = {
        normal: normalResults,
        seismic: seismicResults,
        inputs: inputs
    };
    
    // نمایش نتایج
    displayResults(normalResults, seismicResults);
    
    // رسم نمودار
    setTimeout(() => {
        drawWallDiagram();
    }, 500);
    
    // نمایش دکمه PDF
    document.getElementById('pdfBtn').style.display = 'block';
    
    // تغییر تب به نتایج
    showTab('results');
}

// تحلیل حالت عادی
function performNormalAnalysis(inputs) {
    const Ka = calculateKa(inputs.frictionAngle, inputs.backSlope, inputs.surfaceSlope);
    const activeForce = calculateActiveForce(inputs.wallHeight, inputs.soilDensity, Ka, inputs.surcharge);
    
    const wallWeight = calculateWallWeight(
        inputs.wallHeight, 
        inputs.topThickness, 
        inputs.baseWidth, 
        inputs.masonryDensity, 
        inputs.concreteDensity,
        inputs.wallType,
        inputs.stepCount,
        inputs.stepDepth
    );
    
    const overtturningMoment = calculateOverturningMoment(activeForce, inputs.wallHeight);
    const resistingMoment = calculateResistingMoment(wallWeight, inputs.baseWidth);
    
    const FOTipping = calculateFOTipping(resistingMoment, overtturningMoment);
    const FOSlip = calculateFOSlip(wallWeight, inputs.cohesion * inputs.baseWidth, activeForce.total);
    
    return {
        Ka: Ka.toFixed(4),
        activeForce: activeForce.total.toFixed(2),
        wallWeight: wallWeight.toFixed(2),
        overtturningMoment: overtturningMoment.toFixed(2),
        resistingMoment: resistingMoment.toFixed(2),
        FOTipping: FOTipping.toFixed(3),
        FOSlip: FOSlip.toFixed(3),
        tippingStatus: FOTipping >= 1.5 ? 'ایمن' : 'خطرناک',
        slipStatus: FOSlip >= 1.5 ? 'ایمن' : 'خطرناک'
    };
}

// تحلیل حالت لرزه‌ای
function performSeismicAnalysis(inputs) {
    const Kae = calculateKae(inputs.frictionAngle, inputs.seismicCoeff, inputs.backSlope);
    const Ka = calculateKa(inputs.frictionAngle, inputs.backSlope, inputs.surfaceSlope);
    
    // فشار لرزه‌ای اضافی
    const additionalSeismicForce = 0.5 * inputs.soilDensity * inputs.wallHeight ** 2 * (Kae - Ka);
    
    const activeForce = calculateActiveForce(inputs.wallHeight, inputs.soilDensity, Kae, inputs.surcharge);
    
    const wallWeight = calculateWallWeight(
        inputs.wallHeight, 
        inputs.topThickness, 
        inputs.baseWidth, 
        inputs.masonryDensity, 
        inputs.concreteDensity,
        inputs.wallType,
        inputs.stepCount,
        inputs.stepDepth
    );
    
    // اثر قوه لرزه‌ای
    const seismicInertiaForce = wallWeight * inputs.seismicCoeff;
    
    const overtturningMoment = calculateOverturningMoment(activeForce, inputs.wallHeight) + 
                               (additionalSeismicForce * inputs.wallHeight / 3);
    const resistingMoment = calculateResistingMoment(wallWeight, inputs.baseWidth);
    
    const FOTipping = calculateFOTipping(resistingMoment, overtturningMoment);
    const FOSlip = calculateFOSlip(wallWeight - (wallWeight * inputs.seismicCoeffV), 
                                    inputs.cohesion * inputs.baseWidth, 
                                    activeForce.total + seismicInertiaForce);
    
    return {
        Kae: Kae.toFixed(4),
        additionalSeismicForce: additionalSeismicForce.toFixed(2),
        activeForce: activeForce.total.toFixed(2),
        seismicInertiaForce: seismicInertiaForce.toFixed(2),
        overtturningMoment: overtturningMoment.toFixed(2),
        resistingMoment: resistingMoment.toFixed(2),
        FOTipping: FOTipping.toFixed(3),
        FOSlip: FOSlip.toFixed(3),
        tippingStatus: FOTipping >= 1.1 ? 'ایمن' : 'خطرناک',
        slipStatus: FOSlip >= 1.1 ? 'ایمن' : 'خطرناک'
    };
}

// نمایش نتایج
function displayResults(normalResults, seismicResults) {
    const normalHTML = `
        <div class="result-item">
            <span class="result-label">ضریب فشار فعال (Ka):</span>
            <span class="result-value">${normalResults.Ka}</span>
        </div>
        <div class="result-item">
            <span class="result-label">نیروی فشار خاک:</span>
            <span class="result-value">${normalResults.activeForce} kN/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">وزن دیوار:</span>
            <span class="result-value">${normalResults.wallWeight} kN/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">گشتاور واژگونی:</span>
            <span class="result-value">${normalResults.overtturningMoment} kN.m/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">گشتاور پایدار‌کننده:</span>
            <span class="result-value">${normalResults.resistingMoment} kN.m/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">ضریب اطمینان واژگونی:</span>
            <span class="result-value">${normalResults.FOTipping} <span class="status ${normalResults.tippingStatus === 'ایمن' ? 'safe' : 'danger'}">${normalResults.tippingStatus}</span></span>
        </div>
        <div class="result-item">
            <span class="result-label">ضریب اطمینان لغزش:</span>
            <span class="result-value">${normalResults.FOSlip} <span class="status ${normalResults.slipStatus === 'ایمن' ? 'safe' : 'danger'}">${normalResults.slipStatus}</span></span>
        </div>
    `;
    
    document.getElementById('normalResults').innerHTML = normalHTML;
    
    const seismicHTML = `
        <div class="result-item">
            <span class="result-label">ضریب فشار فعال لرزه‌ای (Kae):</span>
            <span class="result-value">${seismicResults.Kae}</span>
        </div>
        <div class="result-item">
            <span class="result-label">نیروی فشار لرزه‌ای اضافی:</span>
            <span class="result-value">${seismicResults.additionalSeismicForce} kN/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">نیروی اینرسی لرزه‌ای:</span>
            <span class="result-value">${seismicResults.seismicInertiaForce} kN/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">گشتاور واژگونی:</span>
            <span class="result-value">${seismicResults.overtturningMoment} kN.m/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">گشتاور پایدار‌کننده:</span>
            <span class="result-value">${seismicResults.resistingMoment} kN.m/m</span>
        </div>
        <div class="result-item">
            <span class="result-label">ضریب اطمینان واژگونی:</span>
            <span class="result-value">${seismicResults.FOTipping} <span class="status ${seismicResults.tippingStatus === 'ایمن' ? 'safe' : 'danger'}">${seismicResults.tippingStatus}</span></span>
        </div>
        <div class="result-item">
            <span class="result-label">ضریب اطمینان لغزش:</span>
            <span class="result-value">${seismicResults.FOSlip} <span class="status ${seismicResults.slipStatus === 'ایمن' ? 'safe' : 'danger'}">${seismicResults.slipStatus}</span></span>
        </div>
    `;
    
    document.getElementById('seismicResults').innerHTML = seismicHTML;
    
    // تحلیل و توصیه‌ها
    const analysisHTML = generateAnalysis(normalResults, seismicResults);
    document.getElementById('analysis').innerHTML = analysisHTML;
}

// تولید تحلیل و توصیه‌ها
function generateAnalysis(normalResults, seismicResults) {
    let html = '<div class="result-item">';
    
    const normalTipping = parseFloat(normalResults.FOTipping);
    const normalSlip = parseFloat(normalResults.FOSlip);
    const seismicTipping = parseFloat(seismicResults.FOTipping);
    const seismicSlip = parseFloat(seismicResults.FOSlip);
    
    // تحلیل حالت عادی
    html += '<strong style="color: #1565c0;">✓ حالت عادی:</strong><br>';
    if (normalTipping >= 1.5 && normalSlip >= 1.5) {
        html += '✅ دیوار در حالت عادی ایمن است.<br>';
    } else {
        if (normalTipping < 1.5) {
            html += '⚠️ ضریب اطمینان واژگونی کمتر از استاندارد است. توصیه: افزایش عرض پایه یا وزن دیوار<br>';
        }
        if (normalSlip < 1.5) {
            html += '⚠️ ضریب اطمینان لغزش کمتر از استاندارد است. توصیه: افزایش زاویه اصطکاک یا چسبندگی<br>';
        }
    }
    
    // تحلیل حالت لرزه‌ای
    html += '<br><strong style="color: #d32f2f;">🌊 حالت لرزه‌ای:</strong><br>';
    if (seismicTipping >= 1.1 && seismicSlip >= 1.1) {
        html += '✅ دیوار در حالت لرزه‌ای ایمن است.<br>';
    } else {
        if (seismicTipping < 1.1) {
            html += '⚠️ ضریب اطمینان واژگونی در حالت لرزه‌ای نیاز به بهبود دارد<br>';
        }
        if (seismicSlip < 1.1) {
            html += '⚠️ ضریب اطمینان لغزش در حالت لرزه‌ای نیاز به بهبود دارد<br>';
        }
    }
    
    html += '</div>';
    return html;
}

// ترسیم شماتیک دیوار
function drawWallDiagram() {
    const canvas = document.getElementById('wallCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const inputs = calculationResults.inputs || {};
    const scale = 50; // پیکسل به ازای هر متر
    
    if (!inputs.wallHeight) return;
    
    const H = inputs.wallHeight * scale;
    const B = (inputs.baseWidth || 2) * scale;
    const startX = canvas.width / 2 - B / 2;
    const startY = canvas.height - 100;
    
    ctx.font = 'bold 14px Tahoma';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    
    // رسم پی
    ctx.fillStyle = '#A0A0A0';
    ctx.fillRect(startX, startY, B, 50);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, B, 50);
    ctx.fillText('پی بتنی', startX + B + 10, startY + 25);
    
    // رسم دیوار
    ctx.fillStyle = '#D2B48C';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + B * 0.3, startY - H);
    ctx.lineTo(startX + B * 0.7, startY - H);
    ctx.lineTo(startX + B, startY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillText('دیوار بنایی', startX + B + 10, startY - H / 2);
    
    // رسم خاکریز
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX - 150, startY - H * 0.7);
    ctx.lineTo(startX - 100, startY - H * 0.7);
    ctx.lineTo(startX + B * 0.3, startY - H);
    ctx.lineTo(startX + B * 0.3, startY);
    ctx.closePath();
    ctx.fill();
    ctx.fillText('خاک', startX - 100, startY - H / 2);
    
    // رسم نیروها
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    // نیروی فشار خاک
    const forceArrowX = startX - 50;
    const forceArrowY = startY - H / 2;
    const forceLength = 80;
    
    ctx.beginPath();
    ctx.moveTo(forceArrowX, forceArrowY);
    ctx.lineTo(forceArrowX + forceLength, forceArrowY);
    ctx.stroke();
    
    // پیکان
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(forceArrowX + forceLength, forceArrowY);
    ctx.lineTo(forceArrowX + forceLength - 10, forceArrowY - 5);
    ctx.lineTo(forceArrowX + forceLength - 10, forceArrowY + 5);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#E53935';
    ctx.font = '12px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('فشار خاک', forceArrowX + forceLength / 2, forceArrowY - 15);
    
    // ابعاد
    ctx.strokeStyle = '#1976d2';
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.fillStyle = '#1976d2';
    ctx.font = '12px Tahoma';
    
    ctx.beginPath();
    ctx.moveTo(startX - 30, startY);
    ctx.lineTo(startX - 30, startY - H);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(startX - 35, startY);
    ctx.lineTo(startX - 25, startY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(startX - 35, startY - H);
    ctx.lineTo(startX - 25, startY - H);
    ctx.stroke();
    
    ctx.textAlign = 'right';
    ctx.fillText(`H = ${inputs.wallHeight} m`, startX - 50, startY - H / 2);
    
    ctx.beginPath();
    ctx.moveTo(startX, startY + 30);
    ctx.lineTo(startX + B, startY + 30);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(startX, startY + 25);
    ctx.lineTo(startX, startY + 35);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(startX + B, startY + 25);
    ctx.lineTo(startX + B, startY + 35);
    ctx.stroke();
    
    ctx.textAlign = 'center';
    ctx.fillText(`B = ${inputs.baseWidth} m`, startX + B / 2, startY + 55);
}

// تولید گزارش PDF
function generatePDF() {
    // بررسی وجود jsPDF
    if (typeof jsPDF === 'undefined') {
        // دانلود jsPDF
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            createPDFReport();
        };
        document.head.appendChild(script);
    } else {
        createPDFReport();
    }
}

// ایجاد گزارش PDF
function createPDFReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 20;
    
    // تنظیم فونت فارسی (استفاده از فونت توکار)
    doc.setFont('courier');
    doc.setFontSize(16);
    doc.text('گزارش محاسبه پایداری دیوار ساحلی', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 15;
    doc.setFontSize(10);
    doc.text(`توسعه‌دهنده: م.رضا پویا`, pageWidth / 2, yPosition, { align: 'center' });
    doc.text('© تمامی حقوق این نرم‌افزار محفوظ است - 1403', pageWidth / 2, yPosition + 5, { align: 'center' });
    
    yPosition += 15;
    
    // پارامترهای ورودی
    doc.setFontSize(12);
    doc.text('پارامترهای ورودی:', 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(9);
    const inputs = calculationResults.inputs;
    const inputsText = [
        `ارتفاع دیوار: ${inputs.wallHeight} متر`,
        `عرض پایه: ${inputs.baseWidth} متر`,
        `زاویه اصطکاک خاک: ${inputs.frictionAngle}°`,
        `وزن مخصوص خاک: ${inputs.soilDensity} kN/m³`,
        `وزن مخصوص بنایی: ${inputs.masonryDensity} kN/m³`,
        `ضریب شتاب لرزه‌ای: ${inputs.seismicCoeff}`
    ];
    
    inputsText.forEach(text => {
        doc.text(text, 20, yPosition);
        yPosition += 6;
    });
    
    yPosition += 5;
    
    // نتایج حالت عادی
    doc.setFontSize(12);
    doc.text('نتایج حالت عادی:', 20, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    const normalResults = calculationResults.normal;
    const normalText = [
        `ضریب فشار فعال: ${normalResults.Ka}`,
        `ضریب اطمینان واژگونی: ${normalResults.FOTipping} (${normalResults.tippingStatus})`,
        `ضریب اطمینان لغزش: ${normalResults.FOSlip} (${normalResults.slipStatus})`
    ];
    
    normalText.forEach(text => {
        doc.text(text, 20, yPosition);
        yPosition += 6;
    });
    
    yPosition += 5;
    
    // نتایج حالت لرزه‌ای
    doc.setFontSize(12);
    doc.text('نتایج حالت لرزه‌ای:', 20, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    const seismicResults = calculationResults.seismic;
    const seismicText = [
        `ضریب فشار فعال لرزه‌ای: ${seismicResults.Kae}`,
        `ضریب اطمینان واژگونی: ${seismicResults.FOTipping} (${seismicResults.tippingStatus})`,
        `ضریب اطمینان لغزش: ${seismicResults.FOSlip} (${seismicResults.slipStatus})`
    ];
    
    seismicText.forEach(text => {
        doc.text(text, 20, yPosition);
        yPosition += 6;
    });
    
    // ذخیره PDF
    doc.save('گزارش-دیوار-ساحلی.pdf');
}

// اتصال رویدادهای صفحه
document.addEventListener('DOMContentLoaded', () => {
    console.log('اپلیکیشن بارگذاری شد');
    
    // بررسی شرایط PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('اپلیکیشن به صورت standalone اجرا می‌شود');
    }
});

// آپدیت Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
        setInterval(() => {
            reg.update();
        }, 60000); // بررسی هر دقیقه
    });
}