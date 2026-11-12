package service

import (
	"testing"
	"time"
)

func TestWorkflowPermissionsAndTerminalStates(t *testing.T) {
	for _, test := range []struct {
		name, role, user, author, assignee, kind, status, target string
		allowed                                                  bool
	}{
		{"author confirms prepared result", "employee", "author", "author", "executor", "problem", "resolved", "closed", true},
		{"executor cannot impersonate author", "executor", "executor", "author", "executor", "idea", "resolved", "closed", false},
		{"admin cannot impersonate author", "admin", "admin", "author", "executor", "idea", "resolved", "closed", false},
		{"admin can confirm own result", "admin", "author", "author", "executor", "idea", "resolved", "closed", true},
		{"employee cannot progress ticket", "employee", "author", "author", "executor", "problem", "new", "progress", false},
		{"unassigned executor cannot manage", "executor", "other", "author", "executor", "problem", "new", "progress", false},
		{"assigned executor can request clarification", "executor", "executor", "author", "executor", "problem", "progress", "waiting", true},
		{"cannot rewind processing to new", "executor", "executor", "author", "executor", "problem", "progress", "new", false},
		{"confirmed result is immutable", "admin", "admin", "author", "executor", "problem", "closed", "progress", false},
		{"rejection is immutable", "admin", "admin", "author", "executor", "problem", "rejected", "review", false},
		{"praise is acknowledged separately", "executor", "executor", "author", "executor", "praise", "new", "closed", true},
		{"praise is not implemented idea", "executor", "executor", "author", "executor", "praise", "new", "resolved", false},
		{"legacy resolved praise can be acknowledged", "executor", "executor", "author", "executor", "praise", "resolved", "closed", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			actual := AllowedTransitions(User{ID: test.user, Role: test.role}, Appeal{AuthorID: test.author, AssigneeID: test.assignee, Kind: test.kind, Status: test.status})
			if oneOf(test.target, actual...) != test.allowed {
				t.Fatalf("transitions %v, wanted %s allowed=%v", actual, test.target, test.allowed)
			}
		})
	}
}

func TestNoOpUsesInstantNotTimezoneRepresentation(t *testing.T) {
	first, _ := time.Parse(time.RFC3339, "2026-11-12T18:00:00+05:00")
	second, _ := time.Parse(time.RFC3339, "2026-11-12T13:00:00Z")
	if fields := changedFields(Appeal{DueAt: first}, Appeal{DueAt: second}); len(fields) != 0 {
		t.Fatalf("same instant must not create a revision: %v", fields)
	}
}
