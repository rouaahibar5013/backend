import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import * as homeService from "../services/homeService.js";

export const getHomeData = catchAsyncErrors(async (req, res, next) => {
  const data = await homeService.getHomeDataService();
  res.status(200).json({ success: true, ...data });
});