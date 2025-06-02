import { Router } from "express";
import { getProfit } from "./profit.controller";

const profitRouter = Router();

profitRouter.route("/get-profit").get(getProfit);

export default profitRouter;