const joi = require("joi");
const promptSchema = joi.object({
       prompt: joi.object({
    business: joi.string().required(),
    location: joi.string().required(),
  }).required()
});
module.exports = promptSchema;