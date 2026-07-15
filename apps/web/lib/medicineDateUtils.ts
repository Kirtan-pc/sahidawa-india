export function formatExpiryForBadge(isoDate: string | null | undefined): string | undefined {
    if (!isoDate) return undefined;
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return undefined;
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function expiryToIso(expiryStr: string): string {
    const [month, year] = expiryStr.split("/");
    return `${year}-${month.padStart(2, "0")}-01T00:00:00.000Z`;
}

export function formatTime(time: string | null | undefined): string {
    if (!time) return "--:--";

    // Extract HH and mm using regex
    const match = time.match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
    if (!match) {
        // Fallback: try parsing as generic Date if it's a valid date string
        const parsedDate = new Date(time);
        if (!isNaN(parsedDate.getTime())) {
            const hour = parsedDate.getHours();
            const minute = String(parsedDate.getMinutes()).padStart(2, "0");
            const ampm = hour >= 12 ? "PM" : "AM";
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minute} ${ampm}`;
        }
        return time; // Return raw string as fallback
    }

    const hour = parseInt(match[1], 10);
    const minute = match[2];
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute} ${ampm}`;
}
