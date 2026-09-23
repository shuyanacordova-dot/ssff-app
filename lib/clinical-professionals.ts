// Profesionales que también atienden consultas sin perder su rol administrativo principal.
export const additionalOptometristIds = new Set([
  "bd1c3f4d-23a7-4f5b-8909-dd328d4e79d4", // Tiffany Morales
  "535f7c2d-fc42-4a4c-a7f6-fb8b8a5598b6", // Shuyana Córdova
  "40d6c60f-662d-4535-b8f7-91010dead3b8", // Erick Balseca
]);

export const isAdditionalOptometrist = (userId: string) => additionalOptometristIds.has(userId);
