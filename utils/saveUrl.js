module.exports = (req, res, next) => {
    if(req.session.redirectUrl) {
        res.locals.url = req.session.redirectUrl;
    }
    next();
}