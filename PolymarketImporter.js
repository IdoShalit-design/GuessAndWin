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

function normalizeText(value) {
    return (value || '').toLowerCase();
}

const NEXT_GAME_EVENTS_URL = 'https://gamma-api.polymarket.com/events?active=true&closed=false&order=start_date&ascending=true&limit=500&tag_id=102232&related_tags=true';
let cachedNextGames = null;
let nextGameCursor = 0;

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

function findMoneylineMarkets(markets, home, away) {
    const homeName = normalizeText(home);
    const awayName = normalizeText(away);

    const homeMarket = markets.find((market) => {
        const line = market.marketMetadata && market.marketMetadata.opticOddsSelectionLine;
        const question = normalizeText(market.question);
        const groupItemTitle = normalizeText(market.groupItemTitle);
        return line === 'home' || groupItemTitle === homeName || question.includes(`will ${homeName} win`);
    });

    const drawMarket = markets.find((market) => {
        const line = market.marketMetadata && market.marketMetadata.opticOddsSelectionLine;
        const question = normalizeText(market.question);
        const groupItemTitle = normalizeText(market.groupItemTitle);
        return line === 'draw' || question.includes('draw') || groupItemTitle.includes('draw');
    });

    const awayMarket = markets.find((market) => {
        const line = market.marketMetadata && market.marketMetadata.opticOddsSelectionLine;
        const question = normalizeText(market.question);
        const groupItemTitle = normalizeText(market.groupItemTitle);
        return line === 'away' || groupItemTitle === awayName || question.includes(`will ${awayName} win`);
    });

    return { homeMarket, drawMarket, awayMarket };
}

function getExactScoreKey(market) {
    const line = market.marketMetadata && market.marketMetadata.opticOddsSelectionLine;
    if (typeof line === 'string' && /^\d+:\d+$/.test(line)) {
        return line;
    }

    const slugMatch = (market.slug || '').match(/exact-score-(\d+)-(\d+)$/);
    if (slugMatch) {
        return `${slugMatch[1]}:${slugMatch[2]}`;
    }

    const textMatch = `${market.question || ''} ${market.groupItemTitle || ''}`.match(/(\d+)\s*-\s*(\d+)/);
    if (textMatch) {
        return `${textMatch[1]}:${textMatch[2]}`;
    }

    return null;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Polymarket request failed: ${response.status}`);
    }
    return response.json();
}

function isCompatibleBaseEvent(event, exactScoreSlugs, nowTimestamp) {
    if (!event || !event.slug || !event.title || !event.startTime) return false;
    if (!Array.isArray(event.teams) || event.teams.length !== 2) return false;
    if (event.slug.endsWith('-exact-score')) return false;
    if (event.slug.includes('-halftime-result')) return false;
    if (!exactScoreSlugs.has(`${event.slug}-exact-score`)) return false;

    const startTimestamp = new Date(event.startTime).getTime();
    if (!Number.isFinite(startTimestamp) || startTimestamp < nowTimestamp) return false;

    return true;
}

async function getUpcomingCompatibleGames() {
    if (cachedNextGames) return cachedNextGames;

    const events = await fetchJson(NEXT_GAME_EVENTS_URL);
    const exactScoreSlugs = new Set(
        (events || [])
            .map((event) => event.slug)
            .filter((slug) => typeof slug === 'string' && slug.endsWith('-exact-score'))
    );
    const nowTimestamp = Date.now();

    cachedNextGames = (events || [])
        .filter((event) => isCompatibleBaseEvent(event, exactScoreSlugs, nowTimestamp))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return cachedNextGames;
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
    const { homeMarket, drawMarket, awayMarket } = findMoneylineMarkets(moneylineMarkets, home, away);

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
        const exactScoreKey = getExactScoreKey(market);
        if (exactScoreKey) {
            exactTargets[exactScoreKey] = getYesProbability(market);
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
        polymarketUrl: `https://polymarket.com/event/${slug}`,
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

async function importNextPolymarketGame(helpers) {
    const upcomingGames = await getUpcomingCompatibleGames();
    if (!upcomingGames.length) {
        throw new Error('לא נמצאו כרגע משחקי כדורגל קרובים תואמים ב-Polymarket.');
    }

    const selectedEvent = upcomingGames[nextGameCursor % upcomingGames.length];
    nextGameCursor += 1;

    const importedData = await importPolymarketGame(`https://polymarket.com/event/${selectedEvent.slug}`, helpers);
    return {
        ...importedData,
        statusMessage: `נטען המשחק הקרוב: ${selectedEvent.title}. לחיצה נוספת תעבור למשחק הבא.`,
    };
}

async function importPrevPolymarketGame(helpers) {
    const upcomingGames = await getUpcomingCompatibleGames();
    if (!upcomingGames.length) {
        throw new Error('לא נמצאו כרגע משחקי כדורגל קרובים תואמים ב-Polymarket.');
    }

    // Undo the last +1 increment, then step back one more
    nextGameCursor = ((nextGameCursor - 2) % upcomingGames.length + upcomingGames.length) % upcomingGames.length;
    const selectedEvent = upcomingGames[nextGameCursor];
    nextGameCursor += 1;

    const importedData = await importPolymarketGame(`https://polymarket.com/event/${selectedEvent.slug}`, helpers);
    return {
        ...importedData,
        statusMessage: `נטען המשחק הקודם: ${selectedEvent.title}. לחיצה על הבא/הקודם תנווט בין המשחקים.`,
    };
}

window.PolymarketImporter = {
    importPolymarketGame,
    importNextPolymarketGame,
    importPrevPolymarketGame,
};
