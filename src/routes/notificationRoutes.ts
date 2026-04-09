import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function notificationRoutes(app: FastifyInstance) {
  // Authenticated: get notifications + unread count
  app.get(
    "/notifications",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { sub: string };

      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: { userId: user.sub },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.notification.count({
          where: { userId: user.sub, read: false },
        }),
      ]);

      return reply.send({ notifications, unreadCount });
    }
  );

  // Authenticated: mark all notifications as read (must be before :id/read to avoid param conflict)
  app.patch(
    "/notifications/read-all",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user as { sub: string };

        await prisma.notification.updateMany({
          where: { userId: user.sub, read: false },
          data: { read: true },
        });

        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao atualizar notificações.", error: error.message });
      }
    }
  );

  // Authenticated: mark one notification as read
  app.patch(
    "/notifications/:id/read",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user as { sub: string };
        const { id } = request.params as { id: string };

        const notification = await prisma.notification.findUnique({ where: { id } });
        if (!notification) {
          return reply.status(404).send({ message: "Notificação não encontrada." });
        }
        if (notification.userId !== user.sub) {
          return reply.status(403).send({ message: "Sem permissão." });
        }

        await prisma.notification.update({
          where: { id },
          data: { read: true },
        });

        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao atualizar notificação.", error: error.message });
      }
    }
  );
}
