import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function requestRoutes(app: FastifyInstance) {
  // Public: list active requests
  app.get("/requests", async (request, reply) => {
    const requests = await prisma.request.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(requests);
  });

  // Authenticated: list user's own requests
  app.get(
    "/requests/minhas",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { sub: string };
      const requests = await prisma.request.findMany({
        where: { userId: user.sub },
        orderBy: { createdAt: "desc" },
      });
      return reply.send(requests);
    }
  );

  // Authenticated: create a request
  app.post(
    "/requests",
    {
      preHandler: [(app as any).authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      try {
        const user = (request as any).user as { sub: string };
        const { name, phone, email, location, reason, items } = request.body as {
          name: string;
          phone: string;
          email?: string;
          location: string;
          reason: string;
          items: string[];
        };

        if (!name || !phone || !location || !reason || !items || !Array.isArray(items) || items.length === 0) {
          return reply.status(400).send({ message: "Campos obrigatórios ausentes." });
        }

        const newRequest = await prisma.request.create({
          data: {
            name,
            phone,
            email: email ?? null,
            location,
            reason,
            items,
            userId: user.sub,
          },
        });

        return reply.status(201).send({ success: true, request: newRequest });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao criar pedido.", error: error.message });
      }
    }
  );
}
