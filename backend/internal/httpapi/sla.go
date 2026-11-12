package httpapi

import (
	"dauys/internal/service"
	"github.com/gofiber/fiber/v2"
)

func (a *API) sla(c *fiber.Ctx) error {
	ctx, cancel := service.Context()
	defer cancel()
	value, err := service.ReadSLA(ctx, a.Svc.Pool, c.Params("id"), user(c))
	if err != nil {
		return featureError(c, err)
	}
	return c.JSON(value)
}
func (a *API) remind(c *fiber.Ctx) error {
	var in struct {
		Expected int `json:"expected_version"`
	}
	if c.BodyParser(&in) != nil {
		return fail(c, 400, "Проверьте параметры напоминания")
	}
	ctx, cancel := service.Context()
	defer cancel()
	if err := a.Svc.Escalate(ctx, user(c), c.Params("id"), in.Expected); err != nil {
		return featureError(c, err)
	}
	return c.JSON(fiber.Map{"ok": true})
}
