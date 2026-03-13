/**
 * Parses duration strings like "1 hr 30 mins", "45 mins", or "15" into total minutes.
 */
export const parseDurationToMinutes = (duration) => {
    if (!duration) return 0;
    if (typeof duration === "number") return duration;

    const str = String(duration).trim().toLowerCase();

    // If it's just a number string (e.g., "15")
    if (/^\d+$/.test(str)) return Number(str);

    let total = 0;

    // Match hours
    const hrMatch = str.match(/(\d+)\s*hr/);
    if (hrMatch) total += Number(hrMatch[1]) * 60;

    // Match minutes (looking for 'min' or just digits after 'hr')
    // For "1 hr 30 mins", we need to catch the 30.
    // A safer way is to strip the 'hr' part and then look for numbers
    let remaining = str;
    if (hrMatch) {
        remaining = str.replace(/.*hr[s]?/, "");
    }

    const minMatch = remaining.match(/(\d+)/);
    if (minMatch) total += Number(minMatch[1]);

    return total;
};

/**
 * Appends " mins" to numeric strings, otherwise returns as is.
 */
export const formatDuration = (duration) => {
    if (duration === null || duration === undefined || duration === "") return "";
    const str = String(duration).trim();
    if (str === "") return "";

    // If it already has hr or min, return as is
    if (str.toLowerCase().includes("hr") || str.toLowerCase().includes("min")) {
        return str;
    }

    // If it's mostly numeric, add " mins"
    // This catches "15", "15 ", " 15", and even "15.0"
    if (/^\d+(\.\d+)?$/.test(str)) {
        return `${str} mins`;
    }

    return str;
};
