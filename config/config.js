require("dotenv").config();

const env = process.env;

const development = {
  host: env.DB_HOST,
  username: env.DB_USER,
  database: env.DB_NAME,
  password: env.DB_PASSWORD,
  dialect: env.DB_DIALECT,
};

const movieKey = {
  secret: env.SECRET_KEY,
};

const host = {
  port: parseInt(env.HOST_PORT),
};
module.exports = { development, movieKey, host };
