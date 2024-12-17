import mongoose from "mongoose";

export default mongoose.connect(process.env.NODE_DB_URI ?? "");