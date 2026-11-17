// JWT + role-based middlewares — doc-এর Challenge Part
// verifyToken: JWT যাচাই করে req.user-এ user বসায়
// verifyStudent / verifyTutor / verifyAdmin: role চেক করে
const jwt = require("jsonwebtoken");

// ১. Token যাচাই — প্রতিটা protected route-এ প্রথমে এটা চলবে
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  // Header হবে: Authorization: Bearer <token>
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: token missing" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role } — পরের middleware/route এটা পাবে
    next();
  } catch (error) {
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
