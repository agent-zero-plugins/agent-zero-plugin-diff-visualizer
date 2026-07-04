Feature: Rendering diffs
  Scenario: A diff block in the chat is rendered as a visual diff   # BEH-1, BEH-3
    Given I am in a chat
    When a unified diff is posted in the chat
    Then it is rendered as a visual diff

  Scenario: The rendered diff offers maximize and copy   # BEH-2
    Given I am in a chat
    When a unified diff is posted in the chat
    Then the rendered diff has a maximize and a copy control
