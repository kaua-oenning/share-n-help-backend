import Fastify from "fastify";
import cors from "@fastify/cors";
import bemRoutes from "./routes/bemRoutes";

const app = Fastify({
  logger: true,
});

async function start() {
  await app.register(cors, {
    origin: true,
  });

  app.register(bemRoutes);

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
