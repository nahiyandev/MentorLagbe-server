// JWT + role-based middlewares — doc-এর Challenge Part
// verifyToken: JWT যাচাই করে req.user-এ user বসায় (BetterAuth session fallback সহ)
// verifyStudent / verifyTutor / verifyAdmin: role চেক করে
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

// ১. Token যাচাই — প্রতিটা protected route-এ প্রথমে এটা চলবে
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  // Header হবে: Authorization: Bearer <token>
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: token missing" });
  }
  const token = authHeader.split(" ")[1];

  // First try: Standard Server JWT verification
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    return next();
  } catch (jwtErr) {
    // Second try: BetterAuth session token fallback from MongoDB
    try {
      const Session =
        mongoose.models.Session ||
        mongoose.model(
          "Session",
          new mongoose.Schema({}, { strict: false }),
          "session"
        );
      const session = await Session.findOne({ token }).lean();
      if (session && new Date(session.expiresAt) >= new Date()) {
        const user = await User.findById(session.userId);
        if (user) {
          req.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            name: user.name,
          };
          return next();
        }
      }
    } catch {
      // Fall through to 401
    }

    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
}

// ২. Role চেক — verifyToken-এর পরে বসে; ভুল role হলে 403
function verifyRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: wrong role" });
    }
    next();
  };
}

// ডক-এর নামেই export — route-এ verifyStudent / verifyTutor / verifyAdmin লিখলেই হবে
const verifyStudent = verifyRole("student");
const verifyTutor = verifyRole("tutor");
const verifyAdmin = verifyRole("admin");

module.exports = { verifyToken, verifyStudent, verifyTutor, verifyAdmin };
