import { formatTime, formatExpiryForBadge, expiryToIso } from "../lib/medicineDateUtils";

describe("medicineDateUtils", () => {
    describe("formatTime", () => {
        it("should parse and format HH:mm time string correctly", () => {
            expect(formatTime("08:30")).toBe("8:30 AM");
            expect(formatTime("12:00")).toBe("12:00 PM");
            expect(formatTime("13:45")).toBe("1:45 PM");
            expect(formatTime("00:15")).toBe("12:15 AM");
        });

        it("should parse and format HH:mm:ss time string correctly", () => {
            expect(formatTime("08:30:00")).toBe("8:30 AM");
            expect(formatTime("18:16:45")).toBe("6:16 PM");
        });

        it("should parse and format ISO date time string correctly", () => {
            // Parses time from ISO T-separator
            expect(formatTime("2026-07-15T18:16:00Z")).toBe("6:16 PM");
            expect(formatTime("2026-07-15 08:30:00")).toBe("8:30 AM");
        });

        it("should return fallback values for null, undefined or empty time strings", () => {
            expect(formatTime(null)).toBe("--:--");
            expect(formatTime(undefined)).toBe("--:--");
            expect(formatTime("")).toBe("--:--");
        });

        it("should fallback to generic Date parsing or raw input string if regex doesn't match", () => {
            // Valid parseable Date string without explicit time structure
            const d = new Date();
            const dateStr = d.toString();
            const hour = d.getHours();
            const minute = String(d.getMinutes()).padStart(2, "0");
            const ampm = hour >= 12 ? "PM" : "AM";
            const hour12 = hour % 12 || 12;
            const expected = `${hour12}:${minute} ${ampm}`;
            expect(formatTime(dateStr)).toBe(expected);

            // Non-parseable string
            expect(formatTime("invalid-time")).toBe("invalid-time");
        });
    });

    describe("formatExpiryForBadge", () => {
        it("formats valid date correctly", () => {
            expect(formatExpiryForBadge("2026-12-15")).toBe("12/2026");
        });

        it("returns undefined for invalid dates", () => {
            expect(formatExpiryForBadge(null)).toBeUndefined();
            expect(formatExpiryForBadge("invalid")).toBeUndefined();
        });
    });

    describe("expiryToIso", () => {
        it("converts MM/YYYY string to ISO string", () => {
            expect(expiryToIso("12/2026")).toBe("2026-12-01T00:00:00.000Z");
        });
    });
});
