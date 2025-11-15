// Math utility functions

function rand(a, b) {
    return a + Math.random() * (b - a);
}

function randInt(a, b) {
    return Math.floor(rand(a, b + 1));
}

function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
}

function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function randomChoice(arr, n) {
    let cp = [...arr];
    let out = [];
    for (let i = 0; i < n; ++i) {
        out.push(cp.splice(randInt(0, cp.length - 1), 1)[0]);
    }
    return out;
}

function weightedSampleWithoutReplacement(items, count, weightGetter) {
    if (!Array.isArray(items) || items.length === 0 || count <= 0) {
        return [];
    }

    const pool = items.map((item, index) => {
        const rawWeight = typeof weightGetter === 'function' ? Number(weightGetter(item, index)) : 1;
        const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0;
        return { item, weight };
    });

    const results = [];

    while (results.length < count && pool.length > 0) {
        const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);

        let chosenIndex;
        if (totalWeight <= 0) {
            chosenIndex = randInt(0, pool.length - 1);
        } else {
            let threshold = Math.random() * totalWeight;
            for (let i = 0; i < pool.length; i++) {
                threshold -= pool[i].weight;
                if (threshold <= 0) {
                    chosenIndex = i;
                    break;
                }
            }
            if (chosenIndex === undefined) {
                chosenIndex = pool.length - 1;
            }
        }

        const [chosen] = pool.splice(chosenIndex, 1);
        if (chosen) {
            results.push(chosen.item);
        }
    }

    return results;
}

// Export to window for global access
if (typeof window !== 'undefined') {
    window.rand = rand;
    window.randInt = randInt;
    window.clamp = clamp;
    window.dist = dist;
    window.lerp = lerp;
    window.randomChoice = randomChoice;
    window.weightedSampleWithoutReplacement = weightedSampleWithoutReplacement;
}
