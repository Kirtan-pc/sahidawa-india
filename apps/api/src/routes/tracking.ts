import { Router, Request, Response } from "express";
import { supabase } from "../db/client";

const router = Router();

// GET tracked medicines
router.get("/tracked", async (req: Request, res: Response) => {
    // Note: If you want to use authentication, add requireAuth as middleware
    const { data, error } = await supabase.from("tracked_medicines").select("*");

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// POST track a medicine
router.post("/track", async (req: Request, res: Response) => {
    const { medicine_id, medicine_name, batch_number, expiry_date } = req.body;

    const { data, error } = await supabase
        .from("tracked_medicines")
        .insert([{ medicine_id, medicine_name, batch_number, expiry_date }]);

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ message: "Medicine tracked successfully", data });
});

// DELETE tracked medicine
router.delete("/track/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { error } = await supabase.from("tracked_medicines").delete().eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: "Tracked medicine removed" });
});

export default router;
