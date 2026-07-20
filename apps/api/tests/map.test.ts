import express from "express";
import request from "supertest";
import mapRouter from "../src/routes/map";
import { supabase } from "../src/db/client";

jest.mock("../src/db/client", () => ({
    supabase: {
        rpc: jest.fn(),
    },
}));

jest.mock("../src/utils/logger", () => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

import logger from "../src/utils/logger";

const rpcMock = supabase.rpc as jest.Mock;

function buildApp() {
    const app = express();
    app.use("/api/map", mapRouter);
    return app;
}

describe("GET /api/map/nearby", () => {
    const app = buildApp();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return Cache-Control header", async () => {
        const response = await request(app).get("/api/map/nearby?lat=north&lng=east");

        expect(response.headers["cache-control"]).toContain("public");
    });

    it.each([
        ["lat", "/api/map/nearby?lng=73.8567"],
        ["lng", "/api/map/nearby?lat=18.5204"],
        ["lat and lng", "/api/map/nearby"],
    ])("returns 400 when %s query params are missing", async (_missing, path) => {
        const response = await request(app).get(path);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "lat and lng are required query params" });
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("returns 400 when coordinates are non-numeric", async () => {
        const response = await request(app).get("/api/map/nearby?lat=north&lng=east");

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "lat and lng are required query params" });
        expect(rpcMock).not.toHaveBeenCalled();
    });

    it("returns pharmacy and ASHA worker data when both RPCs succeed", async () => {
        const rpcPharmacies = [
            {
                id: "9cb1ba95-ae3c-4c8b-a6f8-c02d1b447b94",
                name: "Jan Aushadhi Kendra Pune",
                address: "Shivajinagar",
                district: "Pune",
                state: "Maharashtra",
                phone_number: "+912012345678",
                is_verified: true,
                lat: 18.521,
                lng: 73.855,
                distance: 1.24,
            },
        ];
        const rpcAshaWorkers = [
            {
                id: "asha-1",
                name: "Asha Worker Pune",
                lat: 18.522,
                lng: 73.854,
                distance: 1.5,
            },
        ];

        rpcMock
            .mockResolvedValueOnce({ data: rpcPharmacies, error: null })
            .mockResolvedValueOnce({ data: rpcAshaWorkers, error: null });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            pharmacies: [
                {
                    id: "9cb1ba95-ae3c-4c8b-a6f8-c02d1b447b94",
                    name: "Jan Aushadhi Kendra Pune",
                    type: "Jan Aushadhi",
                    lat: 18.521,
                    lng: 73.855,
                    address: "Shivajinagar",
                    district: "Pune",
                    state: "Maharashtra",
                    phone_number: "+912012345678",
                    is_verified: true,
                    verified: true,
                    distance: 1.24,
                    distance_km: 1.24,
                },
            ],
            asha_workers: rpcAshaWorkers,
        });
        expect(rpcMock).toHaveBeenCalledTimes(2);
        expect(rpcMock).toHaveBeenCalledWith("get_nearest_pharmacies", {
            query_lat: 18.5204,
            query_lng: 73.8567,
            search_radius_km: 5,
        });
        expect(rpcMock).toHaveBeenCalledWith("get_nearest_asha_workers", {
            query_lat: 18.5204,
            query_lng: 73.8567,
            search_radius_km: 5,
        });
    });

    it("uses a default 10 km radius when radius_km is omitted", async () => {
        rpcMock
            .mockResolvedValueOnce({ data: [], error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        const response = await request(app).get("/api/map/nearby?lat=18.5204&lng=73.8567");

        expect(response.status).toBe(200);
        expect(rpcMock).toHaveBeenCalledTimes(2);
        expect(rpcMock).toHaveBeenCalledWith("get_nearest_pharmacies", {
            query_lat: 18.5204,
            query_lng: 73.8567,
            search_radius_km: 10,
        });
        expect(rpcMock).toHaveBeenCalledWith("get_nearest_asha_workers", {
            query_lat: 18.5204,
            query_lng: 73.8567,
            search_radius_km: 10,
        });
    });

    it("preserves pharmacy data when the ASHA worker RPC fails", async () => {
        const rpcPharmacies = [
            {
                id: "pharmacy-1",
                name: "Jan Aushadhi Kendra Pune",
                address: "Shivajinagar",
                district: "Pune",
                state: "Maharashtra",
                phone_number: null,
                is_verified: true,
                lat: 18.521,
                lng: 73.855,
                distance: 1.24,
            },
        ];
        const ashaError = { message: "ASHA lookup unavailable" };
        rpcMock
            .mockResolvedValueOnce({ data: rpcPharmacies, error: null })
            .mockResolvedValueOnce({ data: null, error: ashaError });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body.pharmacies).toHaveLength(1);
        expect(response.body.pharmacies[0].name).toBe("Jan Aushadhi Kendra Pune");
        expect(response.body.asha_workers).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby ASHA workers",
            error: ashaError,
        });
    });

    it("preserves ASHA worker data when the pharmacy RPC fails", async () => {
        const pharmacyError = { message: "Pharmacy lookup unavailable" };
        const rpcAshaWorkers = [{ id: "asha-1", name: "Asha Worker Pune" }];
        rpcMock
            .mockResolvedValueOnce({ data: null, error: pharmacyError })
            .mockResolvedValueOnce({ data: rpcAshaWorkers, error: null });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body.pharmacies).toEqual([]);
        expect(response.body.asha_workers).toEqual(rpcAshaWorkers);
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby pharmacies",
            error: pharmacyError,
        });
    });

    it("preserves pharmacy data when the ASHA worker RPC rejects", async () => {
        const rpcPharmacies = [
            {
                id: "pharmacy-1",
                name: "Jan Aushadhi Kendra Pune",
                address: "Shivajinagar",
                district: "Pune",
                state: "Maharashtra",
                phone_number: null,
                is_verified: true,
                lat: 18.521,
                lng: 73.855,
                distance: 1.24,
            },
        ];
        const ashaRejection = new Error("ASHA transport unavailable");
        rpcMock
            .mockResolvedValueOnce({ data: rpcPharmacies, error: null })
            .mockRejectedValueOnce(ashaRejection);

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body.pharmacies).toHaveLength(1);
        expect(response.body.pharmacies[0].name).toBe("Jan Aushadhi Kendra Pune");
        expect(response.body.asha_workers).toEqual([]);
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby ASHA workers",
            error: ashaRejection,
        });
    });

    it("preserves ASHA worker data when the pharmacy RPC rejects", async () => {
        const pharmacyRejection = new Error("Pharmacy transport unavailable");
        const rpcAshaWorkers = [{ id: "asha-1", name: "Asha Worker Pune" }];
        rpcMock
            .mockRejectedValueOnce(pharmacyRejection)
            .mockResolvedValueOnce({ data: rpcAshaWorkers, error: null });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body.pharmacies).toEqual([]);
        expect(response.body.asha_workers).toEqual(rpcAshaWorkers);
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby pharmacies",
            error: pharmacyRejection,
        });
    });

    it("returns 500 when both RPC promises reject", async () => {
        const pharmacyRejection = new Error("Pharmacy transport unavailable");
        const ashaRejection = new Error("ASHA transport unavailable");
        rpcMock.mockRejectedValueOnce(pharmacyRejection).mockRejectedValueOnce(ashaRejection);

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Internal server error" });
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby pharmacies",
            error: pharmacyRejection,
        });
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby ASHA workers",
            error: ashaRejection,
        });
        expect(logger.error).toHaveBeenCalledWith({
            message: "Error fetching nearby facilities",
            error: pharmacyRejection,
        });
    });

    it("returns 500 when one RPC rejects and the other resolves with an error", async () => {
        const pharmacyRejection = new Error("Pharmacy transport unavailable");
        const ashaError = { message: "ASHA lookup unavailable" };
        rpcMock
            .mockRejectedValueOnce(pharmacyRejection)
            .mockResolvedValueOnce({ data: null, error: ashaError });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Internal server error" });
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it("treats an empty successful lookup as partial success", async () => {
        const ashaRejection = new Error("ASHA transport unavailable");
        rpcMock
            .mockResolvedValueOnce({ data: [], error: null })
            .mockRejectedValueOnce(ashaRejection);

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ pharmacies: [], asha_workers: [] });
        expect(logger.warn).toHaveBeenCalledWith({
            message: "Error fetching nearby ASHA workers",
            error: ashaRejection,
        });
    });

    it("returns 500 when both Supabase RPCs report errors", async () => {
        const pharmacyError = { message: "Pharmacy lookup unavailable" };
        const ashaError = { message: "ASHA lookup unavailable" };
        rpcMock
            .mockResolvedValueOnce({ data: null, error: pharmacyError })
            .mockResolvedValueOnce({ data: null, error: ashaError });

        const response = await request(app).get(
            "/api/map/nearby?lat=18.5204&lng=73.8567&radius_km=5"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Internal server error" });
        expect(logger.error).toHaveBeenCalledWith({
            message: "Error fetching nearby facilities",
            error: pharmacyError,
        });
    });
});
