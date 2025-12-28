const mongoose = require("mongoose");
const Schema = mongoose.Schema; // ✅ This line defines 'Schema'

const reportSchema = new Schema({
    title: { type: String, required: true },
    author: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Report", reportSchema);