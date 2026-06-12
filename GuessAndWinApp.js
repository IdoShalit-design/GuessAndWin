const { useState } = React;

function MathFormula({ expr, displayMode = false, style = {} }) {
    return (
        <span
            dir="ltr"
            style={{
                display: 'inline-block',
                direction: 'ltr',
                unicodeBidi: 'isolate',
                ...style,
            }}
            dangerouslySetInnerHTML={{
                __html: katex.renderToString(expr, { throwOnError: false, displayMode })
            }}
        />
    );
}

function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

function poissonProb(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function SimulatorApp() {
    // מודל: 'poisson' או 'empirical'
    const [mode, setMode] = useState('poisson'); 

    // שווקי שערים - קבוצה א
    const [pOver05A, setPOver05A] = useState(80);
    const [pOver15A, setPOver15A] = useState(45);
    const [pOver25A, setPOver25A] = useState(15);

    // שווקי שערים - קבוצה ב
    const [pOver05B, setPOver05B] = useState(61);
    const [pOver15B, setPOver15B] = useState(25);
    const [pOver25B, setPOver25B] = useState(8);

    // שוק 1X2
    const [rawWinA, setRawWinA] = useState(54);
    const [rawDraw, setRawDraw] = useState(28);
    const [rawWinB, setRawWinB] = useState(21);

    // ניקוד
    const [ptsOutcome, setPtsOutcome] = useState(1);
    const [ptsScore, setPtsScore] = useState(3);

    // נרמול שוק 1X2
    const totalRaw = rawWinA + rawDraw + rawWinB;
    const normWinA = rawWinA / totalRaw;
    const normDraw = rawDraw / totalRaw;
    const normWinB = rawWinB / totalRaw;

    // חישובי פואסון (למצב 'poisson')
    const lambdaA = -Math.log(1 - (pOver05A / 100));
    const lambdaB = -Math.log(1 - (pOver05B / 100));

    // חישובי שוק אמפירי - הבטחת תקינות מתמטית (O0.5 >= O1.5 >= O2.5)
    const emp05A = pOver05A / 100;
    const emp15A = Math.min(pOver15A / 100, emp05A);
    const emp25A = Math.min(pOver25A / 100, emp15A);

    const emp05B = pOver05B / 100;
    const emp15B = Math.min(pOver15B / 100, emp05B);
    const emp25B = Math.min(pOver25B / 100, emp15B);

    // יצירת מערכי ההתפלגות לפי המודל הנבחר
    const distA = [];
    const distB = [];
    const currentMaxGoals = mode === 'poisson' ? 5 : 3;

    if (mode === 'poisson') {
        for (let g = 0; g <= currentMaxGoals; g++) {
            distA.push(poissonProb(g, lambdaA));
            distB.push(poissonProb(g, lambdaB));
        }
    } else {
        // מודל אמפירי
        distA.push(1 - emp05A);       // 0 שערים
        distA.push(emp05A - emp15A);  // 1 שער
        distA.push(emp15A - emp25A);  // 2 שערים
        distA.push(emp25A);           // 3+ שערים

        distB.push(1 - emp05B);
        distB.push(emp05B - emp15B);
        distB.push(emp15B - emp25B);
        distB.push(emp25B);
    }

    // חישוב מטריצת התוצאות וה-EV
    const resultsMatrix = [];
    for (let gA = 0; gA <= currentMaxGoals; gA++) {
        for (let gB = 0; gB <= currentMaxGoals; gB++) {
            const pExact = distA[gA] * distB[gB];

            let pDirection = normDraw;
            if (gA > gB) pDirection = normWinA;
            if (gB > gA) pDirection = normWinB;

            const ev = (pExact * ptsScore) + ((pDirection - pExact) * ptsOutcome);

            // במודל אמפירי, התוצאה הגבוהה ביותר מייצגת 3+
            const labelA = (mode === 'empirical' && gA === currentMaxGoals) ? '3+' : gA;
            const labelB = (mode === 'empirical' && gB === currentMaxGoals) ? '3+' : gB;

            resultsMatrix.push({
                score: `${labelA} - ${labelB}`,
                pExact: pExact,
                pDirection: pDirection,
                ev: ev
            });
        }
    }

    resultsMatrix.sort((a, b) => b.ev - a.ev);
    const topResults = resultsMatrix.slice(0, 6);

    return (
        <div className="container">
            <header>
                <h1>מנחשים ומנצחים</h1>
                <p className="subtitle">מערכת כפולה: מודל פואסון קלאסי וניתוח שוק אמפירי</p>
            </header>

            <div className="grid">
                {/* עמודה ימנית: הגדרות ומודלים */}
                <div className="space-y">

                    {/* בחירת מודל */}
                    <div className="card">
                        <h2>בחירת מודל אנליטי</h2>
                        <div className="model-toggle">
                            <label>
                                <input type="radio" value="poisson" checked={mode === 'poisson'} onChange={() => setMode('poisson')} />
                                <span>מודל פואסון ⚽</span>
                            </label>
                            <label>
                                <input type="radio" value="empirical" checked={mode === 'empirical'} onChange={() => setMode('empirical')} />
                                <span>שוק אמפירי 📈</span>
                            </label>
                        </div>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                            {mode === 'poisson' ? "מודל מתמטי נאיבי המחשב התפלגות מלאה בהתבסס על שוק ה-Over 0.5 בלבד." : "מודל חכם הנשען על חכמת ההמונים (כסף אמיתי) בשווקי ה-Over המרובים."}
                        </p>
                    </div>

                    <div className="card form-group">
                        <h2>שוק ה-1X2 (Moneyline) %</h2>
                        <div className="form-group">
                            <label>ניצחון קבוצה א' (מארחת):</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="90" value={rawWinA} onChange={(e) => setRawWinA(Number(e.target.value))} />
                                <span className="slider-val">{rawWinA}%</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>תיקו:</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="90" value={rawDraw} onChange={(e) => setRawDraw(Number(e.target.value))} />
                                <span className="slider-val">{rawDraw}%</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>ניצחון קבוצה ב' (אורחת):</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="90" value={rawWinB} onChange={(e) => setRawWinB(Number(e.target.value))} />
                                <span className="slider-val">{rawWinB}%</span>
                            </div>
                        </div>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', margin: '5px 0 0 0'}}>
                            הסתברויות מנורמלות: קבוצה א': {(normWinA*100).toFixed(1)}% | תיקו: {(normDraw*100).toFixed(1)}% | קבוצה ב': {(normWinB*100).toFixed(1)}%
                        </p>
                    </div>

                    {/* שווקי שערים משתנים לפי המודל */}
                    <div className="card form-group">
                        <h2>שוק השערים (Totals)</h2>
                        
                        <h3 style={{fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '5px'}}>קבוצה א'</h3>
                        <div className="form-group" style={{marginBottom: mode === 'poisson' ? '15px' : '5px'}}>
                            <label>Over 0.5:</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="99" value={pOver05A} onChange={(e) => setPOver05A(Number(e.target.value))} />
                                <span className="slider-val">{pOver05A}%</span>
                            </div>
                            {mode === 'poisson' && <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaA.toFixed(3)} שערים</small>}
                        </div>
                        {mode === 'empirical' && (
                            <>
                                <div className="form-group" style={{marginBottom: '5px'}}>
                                    <label>Over 1.5:</label>
                                    <div className="slider-container">
                                        <input type="range" min="1" max="99" value={pOver15A} onChange={(e) => setPOver15A(Number(e.target.value))} />
                                        <span className="slider-val">{pOver15A}%</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Over 2.5:</label>
                                    <div className="slider-container">
                                        <input type="range" min="0" max="80" value={pOver25A} onChange={(e) => setPOver25A(Number(e.target.value))} />
                                        <span className="slider-val">{pOver25A}%</span>
                                    </div>
                                </div>
                            </>
                        )}

                        <h3 style={{fontSize: '1.1rem', color: '#f59e0b', marginBottom: '5px', marginTop: '20px'}}>קבוצה ב'</h3>
                        <div className="form-group" style={{marginBottom: mode === 'poisson' ? '15px' : '5px'}}>
                            <label>Over 0.5:</label>
                            <div className="slider-container">
                                <input type="range" min="5" max="99" value={pOver05B} onChange={(e) => setPOver05B(Number(e.target.value))} />
                                <span className="slider-val">{pOver05B}%</span>
                            </div>
                            {mode === 'poisson' && <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaB.toFixed(3)} שערים</small>}
                        </div>
                        {mode === 'empirical' && (
                            <>
                                <div className="form-group" style={{marginBottom: '5px'}}>
                                    <label>Over 1.5:</label>
                                    <div className="slider-container">
                                        <input type="range" min="1" max="99" value={pOver15B} onChange={(e) => setPOver15B(Number(e.target.value))} />
                                        <span className="slider-val">{pOver15B}%</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Over 2.5:</label>
                                    <div className="slider-container">
                                        <input type="range" min="0" max="80" value={pOver25B} onChange={(e) => setPOver25B(Number(e.target.value))} />
                                        <span className="slider-val">{pOver25B}%</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="card">
                        <h2>חוקי הניקוד בטורניר</h2>
                        <div className="points-grid">
                            <div>
                                <label>נקודות על כיוון (W/D/L):</label>
                                <input type="number" className="points-input" value={ptsOutcome} onChange={(e) => setPtsOutcome(Number(e.target.value))} />
                            </div>
                            <div>
                                <label>נקודות על תוצאה מדויקת:</label>
                                <input type="number" className="points-input" value={ptsScore} onChange={(e) => setPtsScore(Number(e.target.value))} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* עמודה שמאלית: תוצאות ואנליטיקה */}
                <div className="space-y">
                    <div className="card form-group">
                        <h2>התפלגות שערים חזויה</h2>
                        {mode === 'poisson' ? (
                            <>
                                <div dir="ltr" style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0', textAlign: 'left'}}>
                                    <MathFormula expr={"P(k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}"} />
                                </div>
                            </>
                        ) : (
                            <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', margin: '0 0 10px 0'}}>
                                מבוסס על שווקי ה-Over/Under האמפיריים.
                            </p>
                        )}

                        <h3>קבוצה א' (מארחת)</h3>
                        {distA.slice(0, currentMaxGoals + 1).map((p, idx) => {
                            const isMax = (mode === 'empirical' && idx === currentMaxGoals);
                            const label = isMax ? '3+' : idx;
                            return (
                                <div key={'a'+idx} style={{marginBottom: '14px'}}>
                                    <div className="dist-row" style={{marginBottom: '4px'}}>
                                        <div className="dist-label">{label} שערים</div>
                                        <div className="dist-bar-bg">
                                            <div className="dist-bar-fill" style={{width: `${p * 100}%`}}></div>
                                            <div className="dist-pct">{(p*100).toFixed(1)}%</div>
                                        </div>
                                    </div>
                                    <div dir="ltr" style={{fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '70px', textAlign: 'left'}}>
                                        {mode === 'poisson' ? (
                                            <MathFormula expr={`P(${idx}) = \\frac{${lambdaA.toFixed(3)}^{${idx}} e^{-${lambdaA.toFixed(3)}}}{${idx}!} = ${(p * 100).toFixed(1)}\\%`} />
                                        ) : (
                                            idx === 0 ? <MathFormula expr={`P(0) = 100\\% - O0.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            idx === 1 ? <MathFormula expr={`P(1) = O0.5 - O1.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            idx === 2 ? <MathFormula expr={`P(2) = O1.5 - O2.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            <MathFormula expr={`P(3+) = O2.5 = ${(p*100).toFixed(1)}\\%`} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        <h3 style={{marginTop: '25px'}}>קבוצה ב' (אורחת)</h3>
                        {distB.slice(0, currentMaxGoals + 1).map((p, idx) => {
                            const isMax = (mode === 'empirical' && idx === currentMaxGoals);
                            const label = isMax ? '3+' : idx;
                            return (
                                <div key={'b'+idx} style={{marginBottom: '14px'}}>
                                    <div className="dist-row" style={{marginBottom: '4px'}}>
                                        <div className="dist-label">{label} שערים</div>
                                        <div className="dist-bar-bg">
                                            <div className="dist-bar-fill team-b" style={{width: `${p * 100}%`}}></div>
                                            <div className="dist-pct">{(p*100).toFixed(1)}%</div>
                                        </div>
                                    </div>
                                    <div dir="ltr" style={{fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '70px', textAlign: 'left'}}>
                                        {mode === 'poisson' ? (
                                            <MathFormula expr={`P(${idx}) = \\frac{${lambdaB.toFixed(3)}^{${idx}} e^{-${lambdaB.toFixed(3)}}}{${idx}!} = ${(p * 100).toFixed(1)}\\%`} />
                                        ) : (
                                            idx === 0 ? <MathFormula expr={`P(0) = 100\\% - O0.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            idx === 1 ? <MathFormula expr={`P(1) = O0.5 - O1.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            idx === 2 ? <MathFormula expr={`P(2) = O1.5 - O2.5 = ${(p*100).toFixed(1)}\\%`} /> :
                                            <MathFormula expr={`P(3+) = O2.5 = ${(p*100).toFixed(1)}\\%`} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="card">
                        <h2>דירוג תוחלת ערך (EV Optimization)</h2>
                        <div style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0'}}>
                            <MathFormula expr={"EV = P(exact) \\times exactPoints + (P(direction) - P(exact)) \\times outcomePoints"} />
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>תוצאה (א' - ב')</th>
                                    <th>סיכוי מדויק</th>
                                    <th>תוחלת נקודות (EV)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topResults.map((row, index) => (
                                    <tr key={index} className={index === 0 ? 'optimal-row' : ''}>
                                        <td>
                                            {row.score}
                                            {index === 0 && <span className="badge">אופטימלי!</span>}
                                            <div style={{fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px'}}>
                                                <MathFormula expr={`EV = (${row.pExact.toFixed(4)}) \\times ${ptsScore} + ((${row.pDirection.toFixed(4)}) - (${row.pExact.toFixed(4)})) \\times ${ptsOutcome}`} />
                                            </div>
                                        </td>
                                        <td style={{fontVariantNumeric: 'tabular-nums'}}>{(row.pExact * 100).toFixed(2)}%</td>
                                        <td style={{fontVariantNumeric: 'tabular-nums'}}>
                                            {row.ev.toFixed(4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SimulatorApp />);