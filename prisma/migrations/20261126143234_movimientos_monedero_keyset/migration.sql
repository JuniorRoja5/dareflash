-- PU1: el keyset de «Últimos movimientos» del monedero, (createdAt, id) < (t, i) de UNA persona.
-- Solo AÑADE un índice: ni datos ni columnas. El de [userId] se queda (es prefijo de este, pero
-- quitarlo es otro cambio y no hace falta para nada).
-- CreateIndex
CREATE INDEX `WalletLedger_userId_createdAt_id_idx` ON `WalletLedger`(`userId`, `createdAt`, `id`);
