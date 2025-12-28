const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  username: String, // Still used for Display Name (e.g. "Welcome, Vraj")
  email: { 
    type: String, 
    unique: true 
  },
  googleId: String,
  image: {
    type: String,
    default: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Default_pfp.svg"
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.plugin(passportLocalMongoose, { usernameField: 'email' });

module.exports = mongoose.model("User", userSchema);