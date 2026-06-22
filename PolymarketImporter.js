function parseOutcomePrices(outcomePrices) {
    const prices = Array.isArray(outcomePrices)
        ? outcomePrices
        : JSON.parse(outcomePrices || '[]');
    return prices.map((price) => Number(price));
}

function getYesProbability(market) {
    const prices = parseOutcomePrices(market.outcomePrices);
    return Number(prices[0] || 0);
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

function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
}

function poissonProb(k, lambda) {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
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

function getPolymarketSlug(input) {
    const url = new URL(input.trim());
    if (!/(\.|^)polymarket\.com$/i.test(url.hostname)) {
        throw new Error('הקישור חייב להיות מ-Polymarket.');
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const slug = segments[segments.length - 1];

    if (!slug || slug === 'sports' || slug === 'event') {
        throw new Error('לא הצלחתי לזהות slug של משחק מהקישור.');
    }

    return slug;
}

function getTeamsFromEvent(event) {
    const teams = Array.isArray(event.teams) ? event.teams : [];
    const home = teams.find((team) => team.ordering === 'home');
    const away = teams.find((team) => team.ordering === 'away');

    if (home && away && home.name && away.name) {
        return { home: home.name, away: away.name };
    }

    const title = event.title || '';
    const parts = title.split(' vs. ');
    if (parts.length === 2) {
        return { home: parts[0], away: parts[1] };
    }

    throw new Error('לא הצלחתי לזהות את שמות הקבוצות מאירוע Polymarket.');
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Polymarket request failed: ${response.status}`);
    }
    return response.json();
}

async function importPolymarketGame(url) {
    const slug = getPolymarketSlug(url);

    let baseEvent;
    try {
        baseEvent = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`);
    } catch (error) {
        throw new Error('לא הצלחתי לטעון את אירוע המשחק מ-Polymarket.');
    }

    const { home, away } = getTeamsFromEvent(baseEvent);
    const moneylineMarkets = Array.isArray(baseEvent.markets) ? baseEvent.markets : [];
    const homeMarket = moneylineMarkets.find((market) => market.marketMetadata && market.marketMetadata.opticOddsSelectionLine === 'home');
    const drawMarket = moneylineMarkets.find((market) => market.marketMetadata && market.marketMetadata.opticOddsSelectionLine === 'draw');
    const awayMarket = moneylineMarkets.find((market) => market.marketMetadata && market.marketMetadata.opticOddsSelectionLine === 'away');

    if (!homeMarket || !drawMarket || !awayMarket) {
        throw new Error('לא מצאתי שוק 1X2 מלא בעמוד הזה.');
    }

    const normalizedMoneyline = normalizeProbabilities({
        home: getYesProbability(homeMarket),
        draw: getYesProbability(drawMarket),
        away: getYesProbability(awayMarket),
    });

    let exactScoreEvent;
    try {
        exactScoreEvent = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(`${slug}-exact-score`)}`);
    } catch (error) {
        throw new Error('לא מצאתי את אירוע התוצאה המדויקת של המשחק.');
    }

    const exactTargets = {};
    for (const market of exactScoreEvent.markets || []) {
        const line = market.marketMetadata && market.marketMetadata.opticOddsSelectionLine;
        if (typeof line === 'string' && /^\d+:\d+$/.test(line)) {
            exactTargets[line] = getYesProbability(market);
            continue;
        }

        if (market.slug && market.slug.endsWith('any-other')) {
            exactTargets.anyOther = getYesProbability(market);
        }
    }

    if (typeof exactTargets.anyOther !== 'number' || Object.keys(exactTargets).length < 17) {
        throw new Error('לא מצאתי מספיק שווקי תוצאה מדויקת כדי לשחזר את שווקי השערים.');
    }

    const normalizedExactTargets = normalizeProbabilities(exactTargets);
    const fitted = fitLambdasFromMarkets(normalizedExactTargets, normalizedMoneyline);
    const oversA = getOversFromLambda(fitted.lambdaA);
    const oversB = getOversFromLambda(fitted.lambdaB);

    return {
        teamNameA: home,
        teamNameB: away,
        rawWinA: clampPercent(normalizedMoneyline.home),
        rawDraw: clampPercent(normalizedMoneyline.draw),
        rawWinB: clampPercent(normalizedMoneyline.away),
        pOver05A: clampPercent(oversA.over05),
        pOver15A: clampPercent(oversA.over15),
        pOver25A: clampPercent(oversA.over25),
        pOver05B: clampPercent(oversB.over05),
        pOver15B: clampPercent(oversB.over15),
        pOver25B: clampPercent(oversB.over25),
        statusMessage: `יובאו נתוני ${home} נגד ${away} מתוך Polymarket, ושווקי השערים שוחזרו משוק התוצאה המדויקת.`,
    };
}

window.PolymarketImporter = {
    importPolymarketGame,
};
