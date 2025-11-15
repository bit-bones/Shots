/**
 * StateSerializer - Utility helpers for deep-cloning plain entity state
 * and applying network snapshots without per-feature hardcoding.
 */
(function() {
    const hasOwn = Object.prototype.hasOwnProperty;

    function isPrimitive(value) {
        return value === null || value === undefined || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
    }

    function cloneValue(value) {
        if (isPrimitive(value)) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(cloneValue);
        }

        if (value instanceof Set) {
            // Convert sets to arrays to keep payload JSON-friendly
            return Array.from(value).map(cloneValue);
        }

        if (value instanceof Map) {
            const mapped = {};
            value.forEach((entryValue, key) => {
                mapped[key] = cloneValue(entryValue);
            });
            return mapped;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (typeof value === 'object') {
            const result = {};
            for (const key in value) {
                if (!hasOwn.call(value, key)) continue;
                const child = value[key];
                if (typeof child === 'function') continue;
                const cloned = cloneValue(child);
                if (typeof cloned !== 'undefined') {
                    result[key] = cloned;
                }
            }
            return result;
        }

        return undefined;
    }

    function serializeEntity(entity, options = {}) {
        if (!entity) return null;
        if (typeof entity.serialize === 'function' && !options.force) {
            return entity.serialize();
        }

        const exclude = new Set(options.exclude || []);
        const includeSets = new Set(options.includeSets || []);
        const payload = {};

        for (const key in entity) {
            if (!hasOwn.call(entity, key) || exclude.has(key)) continue;
            const value = entity[key];
            if (typeof value === 'function') continue;

            if (value instanceof Set && !includeSets.has(key)) {
                continue; // Skip heavy references; caller can explicitly include if needed
            }

            const cloned = cloneValue(value);
            if (typeof cloned !== 'undefined') {
                payload[key] = cloned;
            }
        }

        if (options.augment) {
            for (const key in options.augment) {
                if (!hasOwn.call(options.augment, key)) continue;
                payload[key] = cloneValue(options.augment[key]);
            }
        }

        return payload;
    }

    function applyState(target, data, options = {}) {
        if (!target || !data) return target;
        const exclude = new Set(options.exclude || []);

        for (const key in data) {
            if (!hasOwn.call(data, key) || exclude.has(key)) continue;
            const cloned = cloneValue(data[key]);
            if (typeof cloned === 'undefined') continue;
            target[key] = cloned;
        }

        return target;
    }

    window.StateSerializer = {
        serialize: serializeEntity,
        applyState,
        cloneValue
    };
})();
