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

async function importPolymarketGame(url, helpers) {
    const {
        normalizeProbabilities,
        clampPercent,
        fitLambdasFromMarkets,
        getOversFromLambda,
    } = helpers;
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
