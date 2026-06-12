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
    const maxGoals = 5;

    const [pOver05A, setPOver05A] = useState(80);
    const [pOver05B, setPOver05B] = useState(61);

    const [rawWinA, setRawWinA] = useState(54);
    const [rawDraw, setRawDraw] = useState(28);
    const [rawWinB, setRawWinB] = useState(21);

    const [ptsOutcome, setPtsOutcome] = useState(1);
    const [ptsScore, setPtsScore] = useState(3);

    const totalRaw = rawWinA + rawDraw + rawWinB;
    const normWinA = rawWinA / totalRaw;
    const normDraw = rawDraw / totalRaw;
    const normWinB = rawWinB / totalRaw;

    const lambdaA = -Math.log(1 - (pOver05A / 100));
    const lambdaB = -Math.log(1 - (pOver05B / 100));

    const distA = [];
    const distB = [];
    for (let g = 0; g <= maxGoals; g++) {
        distA.push(poissonProb(g, lambdaA));
        distB.push(poissonProb(g, lambdaB));
    }

    const resultsMatrix = [];
    for (let gA = 0; gA <= maxGoals; gA++) {
        for (let gB = 0; gB <= maxGoals; gB++) {
            const pExact = distA[gA] * distB[gB];

            let pDirection = normDraw;
            if (gA > gB) pDirection = normWinA;
            if (gB > gA) pDirection = normWinB;

            const ev = (pExact * ptsScore) + ((pDirection - pExact) * ptsOutcome);

            resultsMatrix.push({
                score: `${gA} - ${gB}`,
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
                <p className="subtitle">מודל אופטימיזציית EV והתפלגות פואסון הרשמי</p>
            </header>

            <div className="grid">
                <div className="space-y">
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

                    <div className="card form-group">
                        <h2>שוק השערים (Over 0.5)</h2>
                        <div className="form-group">
                            <label>קבוצה א' Over 0.5 (סיכוי להבקיע לפחות שער אחד):</label>
                            <div className="slider-container">
                                <input type="range" min="10" max="99" value={pOver05A} onChange={(e) => setPOver05A(Number(e.target.value))} />
                                <span className="slider-val">{pOver05A}%</span>
                            </div>
                            <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaA.toFixed(3)} שערים</small>
                        </div>
                        <div className="form-group">
                            <label>קבוצה ב' Over 0.5 (סיכוי להבקיע לפחות שער אחד):</label>
                            <div className="slider-container">
                                <input type="range" min="10" max="99" value={pOver05B} onChange={(e) => setPOver05B(Number(e.target.value))} />
                                <span className="slider-val">{pOver05B}%</span>
                            </div>
                            <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaB.toFixed(3)} שערים</small>
                        </div>
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

                <div className="space-y">
                    <div className="card form-group">
                        <h2>התפלגות שערים חזויה (פואסון)</h2>
                        <div dir="ltr" style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0', textAlign: 'left'}}>
                            <MathFormula expr={"P(k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}"} />
                        </div>
                        <div dir="ltr" style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'left'}}>
                            Team A: {pOver05A}% (<MathFormula expr={`\\lambda = ${lambdaA.toFixed(3)}`} />) | Team B: {pOver05B}% (<MathFormula expr={`\\lambda = ${lambdaB.toFixed(3)}`} />)
                        </div>

                        <h3>קבוצה א' (מארחת)</h3>
                        {distA.slice(0, maxGoals + 1).map((p, idx) => (
                            <div key={'a'+idx} style={{marginBottom: '14px'}}>
                                <div className="dist-row" style={{marginBottom: '4px'}}>
                                    <div className="dist-label">{idx} שערים</div>
                                    <div className="dist-bar-bg">
                                        <div className="dist-bar-fill" style={{width: `${p * 100}%`}}></div>
                                        <div className="dist-pct">{(p*100).toFixed(1)}%</div>
                                    </div>
                                </div>
                                <div dir="ltr" style={{fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '70px', textAlign: 'left'}}>
                                    <MathFormula expr={`P(${idx}) = \\frac{${lambdaA.toFixed(3)}^{${idx}} e^{-${lambdaA.toFixed(3)}}}{${idx}!} = ${(p * 100).toFixed(1)}\\%`} />
                                </div>
                            </div>
                        ))}

                        <h3 style={{marginTop: '25px'}}>קבוצה ב' (אורחת)</h3>
                        {distB.slice(0, maxGoals + 1).map((p, idx) => (
                            <div key={'b'+idx} style={{marginBottom: '14px'}}>
                                <div className="dist-row" style={{marginBottom: '4px'}}>
                                    <div className="dist-label">{idx} שערים</div>
                                    <div className="dist-bar-bg">
                                        <div className="dist-bar-fill team-b" style={{width: `${p * 100}%`}}></div>
                                        <div className="dist-pct">{(p*100).toFixed(1)}%</div>
                                    </div>
                                </div>
                                <div dir="ltr" style={{fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '70px', textAlign: 'left'}}>
                                    <MathFormula expr={`P(${idx}) = \\frac{${lambdaB.toFixed(3)}^{${idx}} e^{-${lambdaB.toFixed(3)}}}{${idx}!} = ${(p * 100).toFixed(1)}\\%`} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="card">
                        <h2>דירוג תוחלת ערך (EV Optimization)</h2>
                        <div style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0'}}>
                            <MathFormula expr={"EV = P(exact) \\times exactPoints + (P(direction) - P(exact)) \\times outcomePoints"} />
                        </div>
                        <p style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                            התוצאה שמייצרת את תוחלת הנקודות הגבוהה ביותר מומלצת לנעילה במערכת.
                        </p>

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