import pino from "pino";
import fs from "fs";
import path from "path";

// Création du dossier logs s'il n'existe pas
const logDirectory = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

// Configuration du logger pour le microservice business
const logger = pino({
    base: {
        service: "business-microservice",
        version: "1.0.0",
    },
    transport: {
        targets: [
            // Transport pour la console
            {
                target: "pino-pretty",
                level: process.env.NODE_ENV === "production" ? "info" : "debug",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname",
                },
            },
            // Transport pour le fichier
            {
                target: "pino/file",
                level: "info",
                options: {
                    destination: path.join(logDirectory, "business.log"),
                    mkdir: true,
                },
            },
        ],
    },
});

export default logger;
