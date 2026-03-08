import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function bemRoutes(app: FastifyInstance) {
  app.get("/bens", async (request, reply) => {
    const bens = await prisma.donation.findMany();
    return reply.send(bens);
  });
}
