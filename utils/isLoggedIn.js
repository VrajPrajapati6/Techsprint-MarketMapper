module.exports = (req, res, next) => {
  if (req.isAuthenticated()) next();
  else {
    req.session.redirectUrl = req.originalUrl;
    req.flash("error" , "You are not authenticated to perform this operation .")
    res.redirect("/login");
  }
};
