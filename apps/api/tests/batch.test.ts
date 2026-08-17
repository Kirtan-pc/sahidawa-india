// @ts-nocheck
import request from "supertest";
import app from "../src/app";

jest.mock("../src/db/client", () => {
    const mock = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
    };

    return { supabase: mock };
});

import { supabase } from "../src/db/client";

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

describe("GET /api/verify/batch", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedSupabase.range.mockReset();
    });

    it("returns 400 for invalid start date", async () => {
        const response = await request(app).get("/api/verify/batch?start=notadate");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid query parameters");
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: "Invalid start date",
                }),
            ])
        );
    });

    it("returns 400 for invalid end date", async () => {
        const response = await request(app).get("/api/verify/batch?end=notadate");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid query parameters");
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: "Invalid end date",
                }),
            ])
        );
    });

    it("returns 400 when sortBy is not in the allow-list", async () => {
        const response = await request(app).get("/api/verify/batch?sortBy=arbitrary-key");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid query parameters");
    });

    it("returns 400 when sortOrder is invalid", async () => {
        const response = await request(app).get("/api/verify/batch?sortOrder=up");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid query parameters");
    });

    it("returns 400 when start is after end", async () => {
        const response = await request(app).get(
            "/api/verify/batch?start=2026-12-31&end=2026-01-01"
        );

        expect(response.status).toBe(400);
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: "start date must not be after end date",
                }),
            ])
        );
    });

    it("returns paginated batch list with valid params", async () => {
        mockedSupabase.range.mockResolvedValueOnce({
            data: [
                {
                    id: "1",
                    batch_number: "BN2024001",
                    manufacturing_date: "2026-01-10",
                    expiry_date: "2099-12-31",
                    recall_status: "none",
                    recall_reason: null,
                    quantity_produced: 5000,
                    created_at: "2026-01-10T00:00:00Z",
                },
            ],
            error: null,
            count: 1,
        });

        const response = await request(app).get("/api/verify/batch");

        expect(response.status).toBe(200);
        expect(response.body.batches).toHaveLength(1);
        expect(response.body.meta).toEqual({
            total: 1,
            page: 1,
            limit: 50,
            totalPages: 1,
        });
    });

    it("uses default sortBy=created_at and sortOrder=desc", async () => {
        mockedSupabase.range.mockResolvedValueOnce({
            data: [],
            error: null,
            count: 0,
        });

        await request(app).get("/api/verify/batch");

        expect(mockedSupabase.order).toHaveBeenCalledWith("created_at", {
            ascending: false,
        });
    });

    it("applies start date filter when valid", async () => {
        mockedSupabase.range.mockResolvedValueOnce({
            data: [],
            error: null,
            count: 0,
        });

        await request(app).get("/api/verify/batch?start=2026-01-01");

        expect(mockedSupabase.gte).toHaveBeenCalledWith("manufacturing_date", "2026-01-01");
    });

    it("applies end date filter when valid", async () => {
        mockedSupabase.range.mockResolvedValueOnce({
            data: [],
            error: null,
            count: 0,
        });

        await request(app).get("/api/verify/batch?end=2026-12-31");

        expect(mockedSupabase.lte).toHaveBeenCalledWith("manufacturing_date", "2026-12-31");
    });

    it("returns 500 when database query fails", async () => {
        mockedSupabase.range.mockResolvedValueOnce({
            data: null,
            error: { message: "database unavailable" },
            count: null,
        });

        const response = await request(app).get("/api/verify/batch");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Failed to fetch batches" });
    });
});

describe("GET /api/verify/batch/:batchNumber", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedSupabase.maybeSingle.mockReset();
    });

    it("returns traceability details when a dedicated batch record exists", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN2024001",
                manufacturing_date: "2026-01-10",
                expiry_date: "2099-12-31",
                recall_status: "none",
                recall_reason: null,
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                    is_cdsco_verified: true,
                    cdsco_match_score: 96.5,
                    matched_cdsco_product: "SahiCure",
                    matched_cdsco_manufacturer: "Sahi Pharma Ltd",
                    product_match_score: 95.0,
                    manufacturer_match_score: 100.0,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: {
                        coordinates: [72.5714, 23.0225],
                    },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN2024001");

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            found: true,
            source: "batches",
            batch: {
                batch_number: "BN2024001",
                manufacturing_date: "2026-01-10",
                expiry_date: "2099-12-31",
                recall_status: "none",
                recall_reason: null,
                quantity_produced: 5000,
            },
            medicine: {
                id: "medicine-1",
                brand_name: "SahiCure",
                generic_name: "Paracetamol",
                cdsco_approval_status: "Approved",
                is_counterfeit_alert: false,
                is_cdsco_verified: true,
                cdsco_match_score: 96.5,
                matched_cdsco_product: "SahiCure",
                matched_cdsco_manufacturer: "Sahi Pharma Ltd",
                product_match_score: 95.0,
                manufacturer_match_score: 100.0,
            },
            manufacturer: {
                name: "Sahi Pharma Ltd",
                license_number: "LIC-12345",
                coordinates: {
                    lat: 23.0225,
                    lng: 72.5714,
                },
            },
            expiry_status: "green",
        });
        expect(mockedSupabase.from).toHaveBeenCalledTimes(1);
        expect(mockedSupabase.from).toHaveBeenCalledWith("batches");
        expect(mockedSupabase.eq).toHaveBeenCalledWith("batch_number", "BN2024001");
    });

    it("falls back to the medicines table when no batch row exists", async () => {
        mockedSupabase.maybeSingle
            .mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({
                data: {
                    id: "medicine-2",
                    brand_name: "CiproSafe",
                    generic_name: "Ciprofloxacin",
                    manufacturer: "Fallback Pharma",
                    batch_number: "MED-FALLBACK-7",
                    manufacturing_date: "2025-02-15",
                    expiry_date: "2026-09-30",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                    is_cdsco_verified: false,
                    cdsco_match_score: 41.2,
                    matched_cdsco_product: null,
                    matched_cdsco_manufacturer: null,
                    product_match_score: 44.0,
                    manufacturer_match_score: 35.0,
                    manufacturer_id: "manufacturer-7",
                },
                error: null,
            })
            .mockResolvedValueOnce({
                data: {
                    name: "Fallback Pharma Pvt Ltd",
                    license_number: "MFG-777",
                    address: "Plot 7",
                    city: "Pune",
                    state: "Maharashtra",
                    pincode: "411001",
                    phone: "02012345678",
                    email: "qa@fallback.example",
                    website: "https://fallback.example",
                    gmp_certified: true,
                    location: {
                        coordinates: [73.8567, 18.5204],
                    },
                },
                error: null,
            });

        const response = await request(app).get(
            "/api/verify/batch/MED-FALLBACK-7?brandName=Crocin"
        );

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            found: true,
            source: "medicines",
            batch: {
                batch_number: "MED-FALLBACK-7",
                manufacturing_date: "2025-02-15",
                expiry_date: "2026-09-30",
                recall_status: "none",
                recall_reason: null,
            },
            medicine: {
                id: "medicine-2",
                brand_name: "CiproSafe",
                generic_name: "Ciprofloxacin",
                cdsco_approval_status: "Approved",
                is_counterfeit_alert: false,
                is_cdsco_verified: false,
                cdsco_match_score: 41.2,
                matched_cdsco_product: null,
                matched_cdsco_manufacturer: null,
                product_match_score: 44.0,
                manufacturer_match_score: 35.0,
            },
            manufacturer: {
                name: "Fallback Pharma Pvt Ltd",
                license_number: "MFG-777",
                coordinates: {
                    lat: 18.5204,
                    lng: 73.8567,
                },
            },
        });
        expect(mockedSupabase.from).toHaveBeenNthCalledWith(1, "batches");
        expect(mockedSupabase.from).toHaveBeenNthCalledWith(2, "medicines");
        expect(mockedSupabase.from).toHaveBeenNthCalledWith(3, "manufacturers");
        expect(mockedSupabase.eq).toHaveBeenNthCalledWith(1, "batch_number", "MED-FALLBACK-7");
        expect(mockedSupabase.eq).toHaveBeenNthCalledWith(2, "batch_number", "MED-FALLBACK-7");
        expect(mockedSupabase.eq).toHaveBeenNthCalledWith(4, "id", "manufacturer-7");
    });

    it("returns 404 when neither batch nor medicine records match", async () => {
        mockedSupabase.maybeSingle
            .mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({ data: null, error: null });

        const response = await request(app).get("/api/verify/batch/UNKNOWN123?brandName=Unknown");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            found: false,
            message: "No batch or medicine record found for this batch number.",
        });
        expect(mockedSupabase.from).toHaveBeenNthCalledWith(1, "batches");
        expect(mockedSupabase.from).toHaveBeenNthCalledWith(2, "medicines");
    });

    it("should return Cache-Control header", async () => {
        const response = await request(app).get("/api/verify/batch/ab");

        expect(response.headers["cache-control"]).toContain("public");
    });

    it("returns 400 for invalid batch number input before querying Supabase", async () => {
        const response = await request(app).get("/api/verify/batch/ab");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid batch number");
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: "Batch number must be at least 3 characters",
                }),
            ])
        );
        expect(mockedSupabase.from).not.toHaveBeenCalled();
    });

    it("rejects wildcard characters before querying Supabase", async () => {
        const response = await request(app).get("/api/verify/batch/BN2024%25");

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid batch number");
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    message: "Batch number contains invalid characters",
                }),
            ])
        );
        expect(mockedSupabase.from).not.toHaveBeenCalled();
    });

    it("returns 500 when the primary batch lookup fails", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: null,
            error: { message: "database unavailable" },
        });

        const response = await request(app).get("/api/verify/batch/BN2024001");

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Database lookup failed" });
        expect(mockedSupabase.from).toHaveBeenCalledTimes(1);
        expect(mockedSupabase.from).toHaveBeenCalledWith("batches");
    });

    it("uses exact batch-number matching and preserves request casing", async () => {
        mockedSupabase.maybeSingle
            .mockResolvedValueOnce({ data: null, error: null })
            .mockResolvedValueOnce({ data: null, error: null });

        await request(app).get("/api/verify/batch/bn2024001?brandName=SomeBrand");

        expect(mockedSupabase.eq).toHaveBeenNthCalledWith(1, "batch_number", "bn2024001");
        expect(mockedSupabase.eq).toHaveBeenNthCalledWith(2, "batch_number", "bn2024001");
    });

    it("returns unknown expiry_status when expiry_date is null", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN-NULL-EXPIRY",
                manufacturing_date: "2026-01-10",
                expiry_date: null,
                recall_status: "none",
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: { coordinates: [72.5714, 23.0225] },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN-NULL-EXPIRY");

        expect(response.status).toBe(200);
        expect(response.body.expiry_status).toBe("unknown");
    });

    it("returns unknown expiry_status for malformed expiry_date", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN-BAD-DATE",
                manufacturing_date: "2026-01-10",
                expiry_date: "not-a-date",
                recall_status: "none",
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: { coordinates: [72.5714, 23.0225] },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN-BAD-DATE");

        expect(response.status).toBe(200);
        expect(response.body.expiry_status).toBe("unknown");
    });

    it("returns red expiry_status for an expired batch", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN-EXPIRED",
                manufacturing_date: "2020-01-10",
                expiry_date: "2024-01-01",
                recall_status: "none",
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: { coordinates: [72.5714, 23.0225] },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN-EXPIRED");

        expect(response.status).toBe(200);
        expect(response.body.expiry_status).toBe("red");
    });

    it("returns yellow expiry_status for near-expiry batch (within 6 months)", async () => {
        const nearFuture = new Date();
        nearFuture.setMonth(nearFuture.getMonth() + 3);
        const nearExpiryDate = nearFuture.toISOString().slice(0, 10);

        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN-NEAR-EXPIRY",
                manufacturing_date: "2025-06-01",
                expiry_date: nearExpiryDate,
                recall_status: "none",
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: { coordinates: [72.5714, 23.0225] },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN-NEAR-EXPIRY");

        expect(response.status).toBe(200);
        expect(response.body.expiry_status).toBe("yellow");
    });

    it("returns green expiry_status for a future expiry date", async () => {
        mockedSupabase.maybeSingle.mockResolvedValueOnce({
            data: {
                batch_number: "BN-FUTURE",
                manufacturing_date: "2026-01-10",
                expiry_date: "2099-12-31",
                recall_status: "none",
                quantity_produced: 5000,
                medicine: {
                    id: "medicine-1",
                    brand_name: "SahiCure",
                    generic_name: "Paracetamol",
                    cdsco_approval_status: "Approved",
                    is_counterfeit_alert: false,
                },
                manufacturer: {
                    name: "Sahi Pharma Ltd",
                    license_number: "LIC-12345",
                    address: "Industrial Area",
                    city: "Ahmedabad",
                    state: "Gujarat",
                    pincode: "380001",
                    phone: "07912345678",
                    email: "quality@sahipharma.example",
                    website: "https://sahipharma.example",
                    gmp_certified: true,
                    location: { coordinates: [72.5714, 23.0225] },
                },
            },
            error: null,
        });

        const response = await request(app).get("/api/verify/batch/BN-FUTURE");

        expect(response.status).toBe(200);
        expect(response.body.expiry_status).toBe("green");
    });
});
