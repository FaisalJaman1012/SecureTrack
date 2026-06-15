const { body, param, validationResult } = require('express-validator');
const xss = require('xss');

const sanitizeBody = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') return xss(obj.trim());
    if (Array.isArray(obj)) return obj.map(item => sanitize(item));
    if (typeof obj === 'object' && obj !== null) {
      for (const key of Object.keys(obj)) obj[key] = sanitize(obj[key]);
    }
    return obj;
  };
  req.body = sanitize(req.body);
  next();
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array().map(e => ({ field: e.path, msg: e.msg })) });
  }
  next();
};

const loginRules = [
  body('username').trim().notEmpty().isLength({ min: 3, max: 50 }).escape(),
  body('password').notEmpty().isLength({ min: 6, max: 128 }),
];

const registerRules = [
  body('username').trim().notEmpty().isLength({ min: 3, max: 50 }).isAlphanumeric().escape(),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must have uppercase, lowercase, number, and special character'),
  body('role').isIn(['admin', 'engineer', 'viewer']),
  body('full_name').optional().trim().isLength({ max: 100 }).escape(),
];

// Helper: allow empty string through isIn checks
const optionalEnum = (field, allowed) =>
  body(field).optional().custom(val => {
    if (val === undefined || val === null || val === '' || allowed.includes(val)) return true;
    throw new Error(`Invalid value for ${field}: "${val}"`);
  });

const projectRules = [
  body('application_name').optional().trim().isLength({ max: 300 }),
  body('url').optional().trim().isLength({ max: 1000 }),
  body('vulnerability_name').optional().trim().isLength({ max: 5000 }),
  body('vulnerabilities').optional(),
  // checkFalsy:true means empty string '' is treated as "not provided" and skips validation
  body('scan_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid scan date'),
  body('report_sharing_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid report sharing date'),
  body('deadline_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid deadline date'),
  body('assigned_to').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('email_subject').optional().trim().isLength({ max: 500 }),
  body('prod_url').optional().trim().isLength({ max: 1000 }),
  body('remarks').optional().trim().isLength({ max: 2000 }),
  body('resolver_team').optional().trim().isLength({ max: 200 }),
  optionalEnum('severity',             ['Critical','High','Medium','Low','Informational']),
  optionalEnum('mitigation_status',    ['Business Requirements','Pending','Resolved','Risk Acceptance']),
  optionalEnum('application_zone',     ['DMZ','External','Internal']),
  optionalEnum('environment',          ['Live','Pre-Prod','Production','UAT']),
  optionalEnum('category',             ['Old Application','Planned','Projects']),
  optionalEnum('engineer',             ['Ashik','Swarup','Adnan','Faisal','EIC','SISA']),
  optionalEnum('go_live_status',       ['Yes','No','Pending']),
  optionalEnum('mitigation_status_prod', ['Mitigated','Not Mitigated']),
];

const appRules = [
  body('application_name').optional().trim().isLength({ max: 300 }),
  body('url').optional().trim().isLength({ max: 1000 }),
  body('last_test_date').optional({ checkFalsy: true }).isISO8601(),
  body('report_share_date').optional({ checkFalsy: true }).isISO8601(),
  body('deadline_date').optional({ checkFalsy: true }).isISO8601(),
  body('assigned_to').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('app_owner').optional().trim().isLength({ max: 200 }),
  body('remarks').optional().trim().isLength({ max: 2000 }),
  optionalEnum('app_type',          ['Web','Android','iOS','API']),
  optionalEnum('environment',       ['Production','UAT']),
  optionalEnum('status',            ['Live','UAT']),
  optionalEnum('exposure',          ['Internal','External']),
  optionalEnum('test_done',         ['Done','Running','Terminated']),
  optionalEnum('mitigation_status', ['Mitigated','Not Mitigated']),
];

const uuidParam = param('id').notEmpty();

module.exports = { sanitizeBody, validate, loginRules, registerRules, projectRules, appRules, uuidParam };
