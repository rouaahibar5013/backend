// ============================================================
//  middlewares/validate.js — Validation des formulaires AUTH
//  Utilise : express-validator + ton ErrorHandler
// ============================================================

import { body, validationResult } from "express-validator";
import ErrorHandler from "./errorMiddleware.js";

// ============================================================
//  Middleware collecteur d'erreurs
//  À placer APRÈS les règles et AVANT le contrôleur dans la route
//
//  Exemple :
//    router.post("/register", registerRules, validate, register)
// ============================================================
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // On prend le message de la première erreur trouvée
    const firstError = errors.array()[0].msg;
    return next(new ErrorHandler(firstError, 422));
  }
  next();
};

// ============================================================
//  Règles : POST /api/auth/register
//  Champs : name, email, password
// ============================================================
export const registerRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Le nom est obligatoire")
    .isLength({ max: 100 })
    .withMessage("Le nom ne peut pas dépasser 100 caractères"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("L'email est obligatoire")
    .isEmail()
    .withMessage("Email invalide")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Le mot de passe est obligatoire")
    .isLength({ min: 8 })
    .withMessage("Le mot de passe doit contenir au moins 8 caractères")
    .matches(/[A-Z]/)
    .withMessage("Le mot de passe doit contenir au moins une majuscule")
    .matches(/[0-9]/)
    .withMessage("Le mot de passe doit contenir au moins un chiffre"),
];

// ============================================================
//  Règles : POST /api/auth/login
//  Champs : email, password
// ============================================================
export const loginRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("L'email est obligatoire")
    .isEmail()
    .withMessage("Email invalide")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Le mot de passe est obligatoire"),
];

// ============================================================
//  Règles : POST /api/auth/forgot-password
//  Champs : email
// ============================================================
export const forgotPasswordRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("L'email est obligatoire")
    .isEmail()
    .withMessage("Email invalide")
    .normalizeEmail(),
];

// ============================================================
//  Règles : POST /api/auth/reset-password
//  Champs : password, confirmPassword
// ============================================================
export const resetPasswordRules = [
  body("password")
    .notEmpty()
    .withMessage("Le mot de passe est obligatoire")
    .isLength({ min: 8 })
    .withMessage("Le mot de passe doit contenir au moins 8 caractères")
    .matches(/[A-Z]/)
    .withMessage("Le mot de passe doit contenir au moins une majuscule")
    .matches(/[0-9]/)
    .withMessage("Le mot de passe doit contenir au moins un chiffre"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("La confirmation du mot de passe est obligatoire")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Les mots de passe ne correspondent pas");
      }
      return true;
    }),
];

// ============================================================
//  Règles : PUT /api/auth/change-password
//  Champs : currentPassword, newPassword, confirmPassword
// ============================================================
export const changePasswordRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Le mot de passe actuel est obligatoire"),

  body("newPassword")
    .notEmpty()
    .withMessage("Le nouveau mot de passe est obligatoire")
    .isLength({ min: 8 })
    .withMessage("Le mot de passe doit contenir au moins 8 caractères")
    .matches(/[A-Z]/)
    .withMessage("Le mot de passe doit contenir au moins une majuscule")
    .matches(/[0-9]/)
    .withMessage("Le mot de passe doit contenir au moins un chiffre"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("La confirmation est obligatoire")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Les mots de passe ne correspondent pas");
      }
      return true;
    }),
];