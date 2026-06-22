const { useState } = React;
const { importPolymarketGame, importNextPolymarketGame } = window.PolymarketImporter;

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

function SliderWithNumber({ min = 0, max = 100, step = 1, value, onChange }) {
    return (
        <>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            />
            <input
                type="number"
                className="slider-number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) onChange(v);
                }}
            />
            <span className="slider-percent">%</span>
        </>
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

function normalizeProbabilities(probabilities) {
    const total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return probabilities;

    return Object.fromEntries(
        Object.entries(probabilities).map(([key, value]) => [key, value / total])
    );
}

function clampPercent(probability) {
    return Math.max(0, Math.min(99, Math.round(probability * 100)));
}

function computeMoneylineFromLambdas(lambdaA, lambdaB, maxGoals = 15) {
    let home = 0;
    let draw = 0;
    let away = 0;

    for (let goalsA = 0; goalsA <= maxGoals; goalsA++) {
        for (let goalsB = 0; goalsB <= maxGoals; goalsB++) {
            const probability = poissonProb(goalsA, lambdaA) * poissonProb(goalsB, lambdaB);
            if (goalsA > goalsB) home += probability;
            else if (goalsA < goalsB) away += probability;
            else draw += probability;
        }
    }

    const total = home + draw + away;
    return {
        home: home / total,
        draw: draw / total,
        away: away / total,
    };
}

function computeExactScoreTargets(lambdaA, lambdaB) {
    const probabilities = {};
    let explicitTotal = 0;

    for (let goalsA = 0; goalsA <= 3; goalsA++) {
        for (let goalsB = 0; goalsB <= 3; goalsB++) {
            const probability = poissonProb(goalsA, lambdaA) * poissonProb(goalsB, lambdaB);
            probabilities[`${goalsA}:${goalsB}`] = probability;
            explicitTotal += probability;
        }
    }

    probabilities.anyOther = Math.max(0, 1 - explicitTotal);
    return probabilities;
}

function fitLambdasFromMarkets(exactTargets, moneylineTargets) {
    const scoreKeys = exactTargets ? Object.keys(exactTargets) : [];
    const exactWeight = exactTargets ? 6 : 0;
    const moneylineWeight = moneylineTargets ? 1 : 0;

    const loss = (lambdaA, lambdaB) => {
        let totalLoss = 0;

        if (exactTargets) {
            const predictedScores = computeExactScoreTargets(lambdaA, lambdaB);
            for (const key of scoreKeys) {
                totalLoss += exactWeight * Math.pow(predictedScores[key] - exactTargets[key], 2);
            }
        }

        if (moneylineTargets) {
            const predictedMoneyline = computeMoneylineFromLambdas(lambdaA, lambdaB);
            totalLoss += moneylineWeight * Math.pow(predictedMoneyline.home - moneylineTargets.home, 2);
            totalLoss += moneylineWeight * Math.pow(predictedMoneyline.draw - moneylineTargets.draw, 2);
            totalLoss += moneylineWeight * Math.pow(predictedMoneyline.away - moneylineTargets.away, 2);
        }

        return totalLoss;
    };

    let best = { lambdaA: 1, lambdaB: 1, loss: Number.POSITIVE_INFINITY };

    for (let lambdaA = 0.05; lambdaA <= 4; lambdaA += 0.05) {
        for (let lambdaB = 0.05; lambdaB <= 4; lambdaB += 0.05) {
            const currentLoss = loss(lambdaA, lambdaB);
            if (currentLoss < best.loss) {
                best = { lambdaA, lambdaB, loss: currentLoss };
            }
        }
    }

    for (let lambdaA = Math.max(0.05, best.lambdaA - 0.2); lambdaA <= best.lambdaA + 0.2; lambdaA += 0.01) {
        for (let lambdaB = Math.max(0.05, best.lambdaB - 0.2); lambdaB <= best.lambdaB + 0.2; lambdaB += 0.01) {
            const currentLoss = loss(lambdaA, lambdaB);
            if (currentLoss < best.loss) {
                best = { lambdaA, lambdaB, loss: currentLoss };
            }
        }
    }

    return best;
}

function getOversFromLambda(lambda) {
    const p0 = poissonProb(0, lambda);
    const p1 = poissonProb(1, lambda);
    const p2 = poissonProb(2, lambda);

    return {
        over05: 1 - p0,
        over15: 1 - p0 - p1,
        over25: 1 - p0 - p1 - p2,
    };
}

function SimulatorApp() {
    // מודל: 'poisson' או 'empirical'
    const [mode, setMode] = useState('empirical'); 

    // הרחבה/כיווץ סדרתים
    const [expandOutcomeProbs, setExpandOutcomeProbs] = useState(false);

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

    // שמות קבוצות
    const [teamNameA, setTeamNameA] = useState('קבוצה א');
    const [teamNameB, setTeamNameB] = useState('קבוצה ב');

    // ייבוא מ-Polymarket
    const [polymarketUrl, setPolymarketUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState('');
    const [importError, setImportError] = useState('');

    // ניקוד
    const [ptsOutcome, setPtsOutcome] = useState(1);
    const [ptsScore, setPtsScore] = useState(3);

    const importFromPolymarket = async () => {
        setImportError('');
        setImportStatus('');

        setIsImporting(true);

        try {
            const importedData = await importPolymarketGame(polymarketUrl, {
                normalizeProbabilities,
                clampPercent,
                fitLambdasFromMarkets,
                getOversFromLambda,
            });
            setPolymarketUrl(importedData.polymarketUrl);
            setTeamNameA(importedData.teamNameA);
            setTeamNameB(importedData.teamNameB);
            setRawWinA(importedData.rawWinA);
            setRawDraw(importedData.rawDraw);
            setRawWinB(importedData.rawWinB);
            setPOver05A(importedData.pOver05A);
            setPOver15A(importedData.pOver15A);
            setPOver25A(importedData.pOver25A);
            setPOver05B(importedData.pOver05B);
            setPOver15B(importedData.pOver15B);
            setPOver25B(importedData.pOver25B);
            setImportStatus(importedData.statusMessage);
        } catch (error) {
            setImportError(error.message || 'הייבוא מ-Polymarket נכשל.');
        } finally {
            setIsImporting(false);
        }
    };

    const importNextGameFromPolymarket = async () => {
        setImportError('');
        setImportStatus('');

        setIsImporting(true);

        try {
            const importedData = await importNextPolymarketGame({
                normalizeProbabilities,
                clampPercent,
                fitLambdasFromMarkets,
                getOversFromLambda,
            });
            setPolymarketUrl(importedData.polymarketUrl);
            setTeamNameA(importedData.teamNameA);
            setTeamNameB(importedData.teamNameB);
            setRawWinA(importedData.rawWinA);
            setRawDraw(importedData.rawDraw);
            setRawWinB(importedData.rawWinB);
            setPOver05A(importedData.pOver05A);
            setPOver15A(importedData.pOver15A);
            setPOver25A(importedData.pOver25A);
            setPOver05B(importedData.pOver05B);
            setPOver15B(importedData.pOver15B);
            setPOver25B(importedData.pOver25B);
            setImportStatus(importedData.statusMessage);
        } catch (error) {
            setImportError(error.message || 'טעינת המשחק הקרוב מ-Polymarket נכשלה.');
        } finally {
            setIsImporting(false);
        }
    };

    // נרמול שוק 1X2
    const totalRaw = rawWinA + rawDraw + rawWinB;
    const normWinA = rawWinA / totalRaw;
    const normDraw = rawDraw / totalRaw;
    const normWinB = rawWinB / totalRaw;

    // חישובי פואסון (למצב 'poisson')
    const lambdaA = -Math.log(1 - (pOver05A / 100));
    const lambdaB = -Math.log(1 - (pOver05B / 100));

    // סיכום קלטים לטקסט שניתן להעתיק
    const summaryText = [
        `Model: ${mode}`,
        `Raw 1X2: A=${rawWinA}% | Draw=${rawDraw}% | B=${rawWinB}%`,
        `Normalized 1X2: A=${(normWinA*100).toFixed(2)}% | Draw=${(normDraw*100).toFixed(2)}% | B=${(normWinB*100).toFixed(2)}%`,
        `Team A Overs: O0.5=${pOver05A}%${mode === 'empirical' ? ` | O1.5=${pOver15A}% | O2.5=${pOver25A}%` : ''}`,
        `Team B Overs: O0.5=${pOver05B}%${mode === 'empirical' ? ` | O1.5=${pOver15B}% | O2.5=${pOver25B}%` : ''}`,
        `Points: outcome=${ptsOutcome} | exact=${ptsScore}`,
        `Lambda (A) = ${lambdaA.toFixed(3)} | Lambda (B) = ${lambdaB.toFixed(3)}`
    ].join('\n');

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
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px'}}>
                            <div>
                                <label style={{fontSize: '0.9rem', marginBottom: '6px', display: 'block'}}>שם {teamNameA === 'קבוצה א' ? 'קבוצה א\'' : 'קבוצה א'}:</label>
                                <input
                                    type="text"
                                    className="points-input"
                                    value={teamNameA}
                                    onChange={(e) => setTeamNameA(e.target.value)}
                                    placeholder="קבוצה א"
                                    style={{fontSize: '0.9rem', padding: '6px 8px'}}
                                />
                            </div>
                            <div>
                                <label style={{fontSize: '0.9rem', marginBottom: '6px', display: 'block'}}>שם {teamNameB === 'קבוצה ב' ? 'קבוצה ב\'' : 'קבוצה ב'}:</label>
                                <input
                                    type="text"
                                    className="points-input"
                                    value={teamNameB}
                                    onChange={(e) => setTeamNameB(e.target.value)}
                                    placeholder="קבוצה ב"
                                    style={{fontSize: '0.9rem', padding: '6px 8px'}}
                                />
                            </div>
                        </div>
                        <div style={{marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--border)'}}>
                            <label style={{fontSize: '0.9rem', marginBottom: '6px', display: 'block'}}>קישור למשחק ב-Polymarket:</label>
                            <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                                <input
                                    type="url"
                                    className="points-input"
                                    value={polymarketUrl}
                                    onChange={(e) => setPolymarketUrl(e.target.value)}
                                    placeholder="https://polymarket.com/sports/world-cup/..."
                                    style={{flex: 1, minWidth: '260px', fontSize: '0.9rem', padding: '8px 10px'}}
                                />
                                <button
                                    className="copy-btn"
                                    onClick={importFromPolymarket}
                                    disabled={isImporting}
                                    style={{opacity: isImporting ? 0.7 : 1, minWidth: '140px'}}
                                >
                                    {isImporting ? 'טוען...' : 'ייבוא אוטומטי'}
                                </button>
                                <button
                                    className="copy-btn"
                                    onClick={importNextGameFromPolymarket}
                                    disabled={isImporting}
                                    style={{opacity: isImporting ? 0.7 : 1, minWidth: '160px'}}
                                >
                                    {isImporting ? 'טוען...' : 'הבא משחק קרוב'}
                                </button>
                            </div>
                            <p style={{fontSize: '0.82rem', color: 'var(--text-muted)', margin: '8px 0 0 0'}}>
                                הייבוא משתמש ב-Gamma API של Polymarket כדי למשוך את שמות הקבוצות, שוק ה-1X2 ושוק התוצאה המדויקת.
                            </p>
                            {importStatus && (
                                <p style={{fontSize: '0.82rem', color: 'var(--success)', margin: '8px 0 0 0'}}>
                                    {importStatus}
                                </p>
                            )}
                            {importError && (
                                <p style={{fontSize: '0.82rem', color: '#dc2626', margin: '8px 0 0 0'}}>
                                    {importError}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="card form-group">
                        <h2>שוק ה-1X2 (Moneyline) %</h2>
                        <div className="form-group">
                            <label>ניצחון {teamNameA} (מארחת):</label>
                            <div className="slider-container">
                                <SliderWithNumber min={1} max={99} value={rawWinA} onChange={(v) => setRawWinA(v)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>תיקו:</label>
                            <div className="slider-container">
                                <SliderWithNumber min={1} max={99} value={rawDraw} onChange={(v) => setRawDraw(v)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>ניצחון {teamNameB} (אורחת):</label>
                            <div className="slider-container">
                                <SliderWithNumber min={1} max={99} value={rawWinB} onChange={(v) => setRawWinB(v)} />
                            </div>
                        </div>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', margin: '5px 0 0 0'}}>
                            הסתברויות מנורמלות: {teamNameA}: {(normWinA*100).toFixed(1)}% | תיקו: {(normDraw*100).toFixed(1)}% | {teamNameB}: {(normWinB*100).toFixed(1)}%
                        </p>
                    </div>

                    {/* שווקי שערים משתנים לפי המודל */}
                    <div className="card form-group">
                        <h2>שוק השערים (Totals)</h2>
                        
                        <h3 style={{fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '5px'}}>{teamNameA}</h3>
                        <div className="form-group" style={{marginBottom: mode === 'poisson' ? '15px' : '5px'}}>
                            <label>Over 0.5:</label>
                            <div className="slider-container">
                                <SliderWithNumber min={0} max={99} value={pOver05A} onChange={(v) => setPOver05A(v)} />
                            </div>
                            {mode === 'poisson' && <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaA.toFixed(3)} שערים</small>}
                        </div>
                        {mode === 'empirical' && (
                            <>
                                <div className="form-group" style={{marginBottom: '5px'}}>
                                    <label>Over 1.5:</label>
                                    <div className="slider-container">
                                        <SliderWithNumber min={0} max={99} value={pOver15A} onChange={(v) => setPOver15A(v)} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Over 2.5:</label>
                                    <div className="slider-container">
                                        <SliderWithNumber min={0} max={99} value={pOver25A} onChange={(v) => setPOver25A(v)} />
                                    </div>
                                </div>
                            </>
                        )}

                        <h3 style={{fontSize: '1.1rem', color: '#f59e0b', marginBottom: '5px', marginTop: '20px'}}>{teamNameB}</h3>
                        <div className="form-group" style={{marginBottom: mode === 'poisson' ? '15px' : '5px'}}>
                            <label>Over 0.5:</label>
                            <div className="slider-container">
                                <SliderWithNumber min={0} max={99} value={pOver05B} onChange={(v) => setPOver05B(v)} />
                            </div>
                            {mode === 'poisson' && <small style={{color: 'var(--text-muted)'}}>&lambda; צפוי: {lambdaB.toFixed(3)} שערים</small>}
                        </div>
                        {mode === 'empirical' && (
                            <>
                                <div className="form-group" style={{marginBottom: '5px'}}>
                                    <label>Over 1.5:</label>
                                    <div className="slider-container">
                                        <SliderWithNumber min={0} max={99} value={pOver15B} onChange={(v) => setPOver15B(v)} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Over 2.5:</label>
                                    <div className="slider-container">
                                        <SliderWithNumber min={0} max={99} value={pOver25B} onChange={(v) => setPOver25B(v)} />
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
                    <div className="card">
                        <h2>דירוג תוחלת ערך (EV Optimization)</h2>
                        <div style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '0'}}>
                            <MathFormula expr={"EV = P(exact) \\times exactPoints + (P(direction) - P(exact)) \\times outcomePoints"} />
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>תוצאה ({teamNameA} - {teamNameB})</th>
                                    <th>סיכוי מדויק</th>
                                    <th>תוחלת נקודות (EV)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topResults.map((row, index) => (
                                    <tr key={index} className={index === 0 ? 'optimal-row' : ''}>
                                        <td>
                                            <span dir="ltr">{row.score}</span>
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

                        <h3>{teamNameA} (מארחת)</h3>
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

                        <h3 style={{marginTop: '25px'}}>{teamNameB} (אורחת)</h3>
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
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expandOutcomeProbs ? '15px' : '10px'}}>
                            <h2 style={{margin: 0, flex: 1}}>הסתברויות לתוצאות (Outcome Probabilities)</h2>
                            <button 
                                onClick={() => setExpandOutcomeProbs(!expandOutcomeProbs)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '1.5rem',
                                    padding: '0 10px',
                                    color: 'var(--text-muted)',
                                    transition: 'transform 0.2s'
                                }}
                            >
                                {expandOutcomeProbs ? '▼' : '▶'}
                            </button>
                        </div>

                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: expandOutcomeProbs ? '25px' : '0'}}>
                            <div style={{padding: '15px', backgroundColor: '#f0f4ff', borderRadius: '8px', border: '1px solid #bfdbfe'}}>
                                <div style={{fontSize: '0.9rem', fontWeight: '600', color: '#1e40af', marginBottom: '5px'}}>ניצחון {teamNameA}</div>
                                <div style={{fontSize: '1.3rem', fontWeight: '700', color: '#1e40af', fontVariantNumeric: 'tabular-nums'}}>
                                    {(normWinA * 100).toFixed(2)}%
                                </div>
                            </div>
                            <div style={{padding: '15px', backgroundColor: '#fef3f2', borderRadius: '8px', border: '1px solid #fecaca'}}>
                                <div style={{fontSize: '0.9rem', fontWeight: '600', color: '#b91c1c', marginBottom: '5px'}}>תיקו</div>
                                <div style={{fontSize: '1.3rem', fontWeight: '700', color: '#b91c1c', fontVariantNumeric: 'tabular-nums'}}>
                                    {(normDraw * 100).toFixed(2)}%
                                </div>
                            </div>
                            <div style={{padding: '15px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0'}}>
                                <div style={{fontSize: '0.9rem', fontWeight: '600', color: '#15803d', marginBottom: '5px'}}>ניצחון {teamNameB}</div>
                                <div style={{fontSize: '1.3rem', fontWeight: '700', color: '#15803d', fontVariantNumeric: 'tabular-nums'}}>
                                    {(normWinB * 100).toFixed(2)}%
                                </div>
                            </div>
                        </div>

                        {expandOutcomeProbs && (
                            <>
                                <div style={{fontSize: '0.9rem', fontWeight: '600', marginBottom: '10px', color: '#0f172a'}}>הסתברויות לכל תוצאה אפשרית:</div>
                                <table style={{width: '100%', fontSize: '0.85rem', textAlign: 'right'}}>
                                    <thead>
                                        <tr style={{backgroundColor: '#f1f5f9', borderBottom: '2px solid var(--border)'}}>
                                            <th style={{padding: '10px', fontWeight: '700', color: '#334155'}}>תוצאה ({teamNameA} - {teamNameB})</th>
                                            <th style={{padding: '10px', fontWeight: '700', color: '#334155'}}>הסתברות</th>
                                            <th style={{padding: '10px', fontWeight: '700', color: '#334155'}}>תוצאה</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resultsMatrix.map((row, index) => {
                                            const parts = row.score.split(' - ');
                                            const goalsA = parseInt(parts[0]);
                                            const goalsB = parseInt(parts[1]);
                                            let outcomeType = 'תיקו';
                                            let outcomeColor = '#b91c1c';
                                            if (goalsA > goalsB) {
                                                outcomeType = 'ניצחון א\'';
                                                outcomeColor = '#1e40af';
                                            } else if (goalsB > goalsA) {
                                                outcomeType = 'ניצחון ב\'';
                                                outcomeColor = '#15803d';
                                            }
                                            return (
                                                <tr key={index} style={{borderBottom: '1px solid var(--border)'}}>
                                                    <td style={{padding: '10px'}} dir="ltr">{row.score}</td>
                                                    <td style={{padding: '10px', fontVariantNumeric: 'tabular-nums'}}>
                                                        {(row.pExact * 100).toFixed(3)}%
                                                        <div dir="ltr" style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px', textAlign: 'left'}}>
                                                            <MathFormula expr={`P(${goalsA},${goalsB}) = P(${goalsA}) \\times P(${goalsB})`} />
                                                        </div>
                                                    </td>
                                                    <td style={{padding: '10px', color: outcomeColor, fontWeight: '600'}}>{outcomeType}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="card">
                <h2>סיכום קלטים (להעתקה)</h2>
                <div className="form-group">
                    <label>העתק את כל הקלטים כאן:</label>
                    <textarea className="summary-textarea" readOnly rows={8} value={summaryText} />
                    <div style={{marginTop: '8px'}}>
                        <button className="copy-btn" onClick={() => navigator.clipboard && navigator.clipboard.writeText(summaryText)}>העתק</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SimulatorApp />);
