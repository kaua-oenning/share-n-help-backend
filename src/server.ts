import Fastify from "fastify";
import bemRoutes from "./routes/bemRoutes";

const app = Fastify({
  logger: true,
});

app.register(bemRoutes);

async function start() {
  try {
    await app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
