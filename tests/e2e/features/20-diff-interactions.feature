Feature: Diff overlay, copy, and edge-case handling

  Scenario: Maximizing a rendered diff opens a single fullscreen overlay   # BEH-4
    Given I am in a chat
    When a unified diff is posted in the chat
    And I maximize the rendered diff
    Then a fullscreen diff overlay is shown with the rendered diff

  Scenario: The overlay closes via its close button and the inline diff survives   # BEH-5
    Given I am in a chat
    When a unified diff is posted in the chat
    And I maximize the rendered diff
    And I close the overlay with its close button
    Then the overlay is gone and the inline diff is still rendered

  Scenario: The overlay closes via a backdrop click   # BEH-5
    Given I am in a chat
    When a unified diff is posted in the chat
    And I maximize the rendered diff
    And I click the overlay backdrop
    Then the overlay is gone and the inline diff is still rendered

  Scenario: The overlay closes via the Escape key   # BEH-5
    Given I am in a chat
    When a unified diff is posted in the chat
    And I maximize the rendered diff
    And I press the Escape key
    Then the overlay is gone and the inline diff is still rendered

  Scenario: Copying a rendered diff puts the raw diff text on the clipboard   # BEH-6
    Given I am in a chat
    When a unified diff is posted in the chat
    And I copy the rendered diff
    Then the clipboard holds the raw unified diff text

  Scenario: A multi-file diff renders both files inside one visual diff   # BEH-1
    Given I am in a chat
    When a multi-file unified diff is posted in the chat
    Then one visual diff shows both files

  Scenario: Malformed diff text falls back to the readable plain code block   # BEH-3
    Given I am in a chat
    When a valid and a malformed diff block are posted in the chat
    Then only the valid diff renders visually and the malformed block stays readable plain code

  Scenario: A non-diff code fence is left untouched   # BEH-1
    Given I am in a chat
    When a valid diff and a non-diff code block are posted in the chat
    Then only the diff block renders visually and the non-diff block is untouched
