import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Chainable Supabase mock. from/select/update/delete/eq return the chain; the
// terminal methods (order for list, maybeSingle for revoke/delete) resolve to
// values configured per test via mockState. The `mock` prefix lets the hoisted
// jest.mock factory reference these safely.
// ---------------------------------------------------------------------------
const mockState = {
    orderResult: { data: [] as unknown, error: null as unknown },
    maybeSingleResult: { data: null as unknown, error: null as unknown },
};

const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    update: jest.fn(() => mockSupabase),
    delete: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    order: jest.fn(() => Promise.resolve(mockState.orderResult)),
    maybeSingle: jest.fn(() => Promise.resolve(mockState.maybeSingleResult)),
};

jest.mock("../src/db/client", () => ({ supabase: mockSupabase }));

// requireAuth is exercised elsewhere; here it just reflects the x-test-user
// header into req.user so the route handlers can be tested in isolation.
jest.mock("../src/middleware/auth", () => ({
    requireAuth: (
        req: express.Request & { user?: { id: string } },
        _res: express.Response,
        next: express.NextFunction
    ) => {
        const uid = req.headers["x-test-user"];
        if (typeof uid === "string" && uid) {
            req.user = { id: uid };
        }
        next();
    },
}));

jest.mock("../src/utils/logger", () => ({
    __esModule: true,
    default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import apiKeysRouter from "../src/routes/apiKeys";
import { requireApiKey, ApiKeyRequest } from "../src/middleware/apiKeyAuth";
import type { Response } from "express";

const app = express();
app.use(express.json());
app.use("/api/keys", apiKeysRouter);

beforeEach(() => {
    jest.clearAllMocks();
    mockState.orderResult = { data: [], error: null };
    mockState.maybeSingleResult = { data: null, error: null };
});

describe("GET /api/keys", () => {
    it("returns the caller's keys scoped to their user_id", async () => {
        mockState.orderResult = {
            data: [{ id: "k1", scopes: [], is_active: true }],
            error: null,
        };

        const res = await request(app).get("/api/keys").set("x-test-user", "user-1");

        expect(res.status).toBe(200);
        expect(res.body.keys).toHaveLength(1);
        expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-1");
        // Secrets/hashes must never be selected.
        const selected = mockSupabase.select.mock.calls[0][0] as string;
        expect(selected).not.toContain("key_hash");
        expect(selected).not.toContain("key_salt");
    });

    it("rejects an unauthenticated caller", async () => {
        const res = await request(app).get("/api/keys");
        expect(res.status).toBe(401);
    });
});

describe("POST /api/keys/:id/revoke", () => {
    it("marks the key inactive, scoped to the caller", async () => {
        mockState.maybeSingleResult = { data: { id: "k1" }, error: null };

        const res = await request(app).post("/api/keys/k1/revoke").set("x-test-user", "user-1");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: "API key revoked", keyId: "k1" });
        expect(mockSupabase.update).toHaveBeenCalledWith({ is_active: false });
        expect(mockSupabase.eq).toHaveBeenCalledWith("id", "k1");
        expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("returns 404 when the key is not the caller's", async () => {
        mockState.maybeSingleResult = { data: null, error: null };

        const res = await request(app)
            .post("/api/keys/someone-elses/revoke")
            .set("x-test-user", "user-1");

        expect(res.status).toBe(404);
    });
});

describe("DELETE /api/keys/:id", () => {
    it("deletes the caller's key", async () => {
        mockState.maybeSingleResult = { data: { id: "k1" }, error: null };

        const res = await request(app).delete("/api/keys/k1").set("x-test-user", "user-1");

        expect(res.status).toBe(200);
        expect(mockSupabase.delete).toHaveBeenCalled();
        expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("returns 404 when the key does not belong to the caller", async () => {
        mockState.maybeSingleResult = { data: null, error: null };

        const res = await request(app).delete("/api/keys/nope").set("x-test-user", "user-1");

        expect(res.status).toBe(404);
    });
});

describe("requireApiKey rejects revoked keys", () => {
    const createRes = () => {
        const res = {
            statusCode: 200,
            body: undefined as unknown,
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            json(payload: unknown) {
                this.body = payload;
                return this;
            },
        };
        return res as unknown as Response & { statusCode: number; body: unknown };
    };

    it("returns 401 for a key whose is_active is false, before hashing", async () => {
        const future = new Date(Date.now() + 60_000).toISOString();
        mockState.maybeSingleResult = {
            data: {
                id: "k1",
                user_id: "user-1",
                scopes: [],
                expires_at: future,
                key_hash: "unused",
                key_salt: "unused",
                is_active: false,
            },
            error: null,
        };

        const req = { headers: { "x-api-secret": "k1.some-secret" } } as unknown as ApiKeyRequest;
        const res = createRes();
        const next = jest.fn();

        await requireApiKey(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "API key has been revoked" });
        expect(next).not.toHaveBeenCalled();
    });
});
