import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function userRoutes(app: FastifyInstance) {
  // Public: get user profile
  app.get("/users/:id/profile", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, createdAt: true },
      });

      if (!user) {
        return reply.status(404).send({ message: "Usuário não encontrado." });
      }

      const [totalDonations, totalCompleted, donations] = await Promise.all([
        prisma.donation.count({ where: { userId: id } }),
        prisma.donation.count({ where: { userId: id, status: "donated" } }),
        prisma.donation.findMany({
          where: { userId: id, status: "donated" },
          select: {
            id: true,
            title: true,
            categoryId: true,
            imageUrl: true,
            condition: true,
            location: true,
            description: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const badges: string[] = [];
      if (totalCompleted >= 1) badges.push("first_donation");
      if (totalCompleted >= 5) badges.push("active_donor");
      if (totalCompleted >= 10) badges.push("frequent_donor");
      if (totalCompleted >= 20) badges.push("veteran");

      return reply.send({
        id: user.id,
        name: user.name,
        createdAt: user.createdAt,
        totalDonations,
        totalCompleted,
        badges,
        donations,
      });
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao buscar perfil.", error: error.message });
    }
  });
}
