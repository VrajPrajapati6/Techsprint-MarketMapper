// Env setup
require("dotenv").config();

// Importing express
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const User = require("./models/User.js"); 
const Report = require("./models/Report.js");

// --- GEMINI SETUP ---
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// Setting views path
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Importing utils
const expressError = require("./utils/errorHandler.js");
const isLoggedIn = require("./utils/isLoggedIn.js");
const wrapAsync = require("./utils/wrapAsync.js");
const saveUrl = require("./utils/saveUrl.js");

// Data parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// EJS-mate
const ejsMate = require("ejs-mate");
app.engine("ejs", ejsMate);

// Express session
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");

const store = MongoStore.create({
  mongoUrl: process.env.DATABASE_LINK,
  secret: process.env.SECRET,
  touchAfter: 24 * 3600,
});

app.use(session({
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
}));

// Passport & Flash
app.use(passport.initialize());
app.use(passport.session());
const flash = require("connect-flash");
app.use(flash());

// Middleware
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.auth = req.isAuthenticated();
  res.locals.currUser = req.user; 
  next();
});

require("./config/passport.js");

// Database Connection
mongoose.connect(process.env.DATABASE_LINK)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// Start Server
app.listen(8080, () => {
    console.log("🚀 Server running on http://localhost:8080");
});

// 1. LANDING PAGE
app.get("/", (req, res) => {
    if (req.isAuthenticated()) return res.redirect("/dashboard");
    res.render("landing", { title: "Welcome", link: "landing" });
});

// 2. DASHBOARD
app.get("/dashboard", isLoggedIn, wrapAsync(async (req, res) => {
    try {
        // 1. Fetch real reports from your MongoDB for the logged-in user
        const allReports = await Report.find({ author: req.user._id }).sort({ createdAt: -1 }); 
        
        // 2. Define the 'count' variable for the EJS template
        const count = allReports.length; 
        
        // 3. Logic to find the most frequent location
        const locations = allReports.map(r => r.location).filter(l => l);
        const topRegion = locations.length > 0 
            ? locations.sort((a,b) =>
                locations.filter(v => v===a).length - locations.filter(v => v===b).length
            ).pop() 
            : "None";

        // 4. Pass all variables to home.ejs so they are DEFINED
        res.render("home", { 
            title: "Dashboard",
            reports: allReports, 
            count: count, 
            topRegion: topRegion,
            link: 'dashboard' 
        });
    } catch (err) {
        console.error("Dashboard Error:", err);
        // Fallback so the page doesn't crash if DB fails
        res.render("home", { 
            title: "Dashboard", 
            reports: [], 
            count: 0, 
            topRegion: "None", 
            link: "dashboard" 
        });
    }
}));

// 3. ANALYSIS PAGE (Input)
app.get("/analysis", isLoggedIn, (req, res) => {
    res.render("analysis", { title: "Start Analysis", link: "analysis" });
});

// 4. ANALYSIS RESULT (The Brain)
app.post("/analysis/loading", isLoggedIn, (req, res) => {
    const { query } = req.body;
    if (!query) return res.redirect("/analysis");

    res.render("loading", { 
        query: query, 
        title: "Neural Processing", 
        link: "analysis",
        isRerun: "false" // New analysis
    });
});

app.post("/result", isLoggedIn, wrapAsync(async (req, res) => {
    const { query, isRerun } = req.body; 

    if(!query) {
        req.flash("error", "Please enter a valid business idea.");
        return res.redirect("/analysis");
    }

    if (isRerun !== "true") {
        const newReport = new Report({
            title: query,
            author: req.user._id,
            location: query.split(" ").pop() || "Ahmedabad"
        });
        await newReport.save(); 
        console.log("Saving NEW analysis to database...");
    } else {
        console.log("Viewing EXISTING analysis - skipping database save.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
    Act as an expert Business Consultant and Market Analyst.
    The user wants to open: "${query}".
    SIMULATE a complete market analysis.
    
    RETURN JSON ONLY. NO MARKDOWN.
    Strictly follow this structure:
    {
      "market_score": (Integer 0-100),
      "competition_level": "Low" | "Medium" | "High",
      "total_competitors_count": (Approximate number of similar shops in that area),
      "average_market_rating": (Average star rating of competitors, e.g., 4.1),
      "center_coords": { "lat": Number, "lng": Number },
      "competitors": [
          { "name": "Name", "rating": 4.5, "lat": Number, "lng": Number }
      ],
      "alternative_locations": [
          { "area": "Area Name", "reason": "Why this area is good" }
      ],
      "gap_analysis": "2-3 sentences explaining the gap.",
      "swot": {
        "strengths": [".."],
        "weaknesses": [".."],
        "opportunities": [".."],
        "threats": [".."]
      },
      "suggested_names": ["Name 1", "Name 2"]
    }
    `;

    try {
        console.log("--> Sending request to Gemini...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Cleanup
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const analysisData = JSON.parse(text);
        console.log("--> Analysis Received!");

        res.render("result", { 
            title: "Analysis Result", 
            link: "result",
            data: analysisData,
            query: query
        });

    } catch (e) {
        console.error("Gemini Error:", e);
        req.flash("error", "AI Analysis failed. Please try again.");
        res.redirect("/analysis");
    }
}));

app.get("/analysis/rerun", isLoggedIn, wrapAsync(async (req, res) => {
    const { query } = req.query;
    
    if(!query) return res.redirect("/dashboard");

    res.render("loading", { 
        query: query, 
        title: "Neural Mapping", 
        link: "analysis" ,
        isRerun: "true"

    });
}));

app.post("/reports/:id/delete", isLoggedIn, wrapAsync(async (req, res) => {
    try {
        const { id } = req.params;
        await Report.findOneAndDelete({ _id: id, author: req.user._id });
        
        req.flash("success", "Report deleted successfully!");
        res.redirect("/dashboard");
    } catch (err) {
        console.error("Delete Error:", err);
        req.flash("error", "Could not delete report.");
        res.redirect("/dashboard");
    }
}));

// 5. LOGIN PAGE
app.get("/login", (req, res) => {
  res.render("login", { link: "login", title: "Sign In" });
});

// 6. MANUAL LOGIN
app.post("/login", wrapAsync(async (req, res, next) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email });
    if (!user) {
        req.flash("error", "Email does not exist. Please register first.");
        return res.redirect("/login");
    }
    passport.authenticate("local", {
        failureRedirect: "/login",
        failureFlash: true
    })(req, res, next);
}));

// 7. MANUAL SIGN UP
app.post("/signup", wrapAsync(async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        const user = new User({ email: email, username: username });
        const registeredUser = await User.register(user, password);
        req.login(registeredUser, (err) => {
            if (err) return next(err);
            req.flash("success", "Welcome to MarketMapper!");
            res.redirect("/dashboard");
        });
    } catch (e) {
        console.log("Signup Error:", e.message);
        req.flash("error", e.message); 
        res.redirect("/login");
    }
}));

// 8. GOOGLE AUTH
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get("/auth/google/callback", saveUrl, passport.authenticate("google", { failureRedirect: "/login", failureFlash: true }),
  (req, res) => {
    req.flash("success", "Welcome to MarketMapper !!");
    const redirectUrl = res.locals.url || "/dashboard";
    delete req.session.redirectUrl;
    res.redirect(redirectUrl);
  }
);

// 9. LOGOUT
app.get("/logout", isLoggedIn, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.flash("success", "Logged out successfully.");
    res.redirect("/");
  });
});

app.get("/history", isLoggedIn, wrapAsync(async (req, res) => {
    const allReports = await Report.find({ author: req.user._id }).sort({ createdAt: -1 });

    res.render("history", { 
        title: "Market History", 
        reports: allReports, 
        link: "history" 
    });
}));

app.get("/profile", isLoggedIn, (req, res) => {
    res.render("profile", { 
        title: "Neural Profile", 
        link: "profile" 
    });
});
app.get("/profile/edit", isLoggedIn, (req, res) => {
    res.render("editProfile", { 
        title: "Edit Neural Identity", 
        link: "profile" 
    });
});

// 2. ROUTE TO PROCESS THE USERNAME UPDATE
app.post("/profile/update", isLoggedIn, wrapAsync(async (req, res) => {
    const { username } = req.body;
    
    // Update the username in MongoDB
    await User.findByIdAndUpdate(req.user._id, { username });
    
    // Optional: Flash message to confirm success
    // req.flash("success", "Neural signature updated successfully!");
    
    res.redirect("/profile");
}));

// index.js - Updated Mock Route with all new data fields
// app.get("/test-ui", (req, res) => {
//     const mockData = {
//         query: "Neural Coffee Hub in Satellite, Ahmedabad",
//         data: {
//             market_score: 88,
//             competition_level: "Medium",
//             total_competitors_count: 12, // New field added
//             average_market_rating: 4.2,   // New field added
//             gap_analysis: "While the corridor is saturated with global QSR chains, there is a lack of specialized 'Gourmet' burger outlets catering to the local demographic.",
//             swot: {
//                 strengths: ["Prime Location", "High Footfall"],
//                 weaknesses: ["High Rent", "Limited Parking"],
//                 opportunities: ["Evening Crowd", "Digital Marketing"],
//                 threats: ["Established Chains"]
//             },
//             alternative_locations: [ // New field added
//                 { area: "Thaltej", reason: "Emerging premium residential market with lower entry costs." },
//                 { area: "Prahlad Nagar", reason: "Established corporate crowd seeking evening hangout spots." }
//             ],
//             suggested_names: ["Neural Brew", "Cyber Cafe", "Market Node"],
//             center_coords: { lat: 23.0225, lng: 72.5714 },
//             competitors: [
//                 { name: "Coffee One", lat: 23.025, lng: 72.575, rating: 4.5 },
//                 { name: "Brew Hub", lat: 23.020, lng: 72.570, rating: 4.2 }
//             ]
//         }
//     };

//     res.render("result", {
//         title: "Analysis Result (UI Test)",
//         link: "result",
//         query: mockData.query,
//         data: mockData.data
//     });
// });


// Error handling
app.use((err, req, res, next) => {
  let { status: st = 400, message = "This page not found" } = err;
  res.status(st).render("error", { title: "Error", link: "error", code: st, message });
});
