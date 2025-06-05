import { Router } from "express";
import { getProfit } from "./profit.controller";

const profitRouter = Router();

profitRouter.route("/get-all-profits").get(getProfit);


export default profitRouter;