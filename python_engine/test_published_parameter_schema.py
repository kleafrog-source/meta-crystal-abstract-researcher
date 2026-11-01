import unittest

from python_engine.published_parameter_schema import clean_published_parameter, parameter_text


class PublishedParameterSchemaTest(unittest.TestCase):
    def test_control_allowlist_removes_pipeline_fields_and_inapplicable_values(self):
        source = {
            "technical_name": "filter_mode", "ui_element": "Select", "default": "soft",
            "options": ["soft", "hard"], "min_value": 0, "step": 1,
            "genesis": {"parent_parameters": ["secret"]}, "_collection": {"source_file": "C:/private/batch.json"},
            "_semantic_group": {"group_id": "draft"}, "source_file": "D:/batch.json",
        }
        clean = clean_published_parameter(source)
        self.assertEqual(clean, {"technical_name": "filter_mode", "ui_element": "Select", "default": "soft", "options": ["soft", "hard"]})

    def test_embedding_allowlist_excludes_defaults_and_provenance(self):
        text = parameter_text({
            "technical_name": "filter_mode", "ui_element": "Select", "name_ru": "Режим фильтра",
            "description_en": "Selects a filter mode.", "unit": "mode", "quantity_kind": "mode",
            "options": ["soft", "hard"], "default": "soft", "genesis": {"package_id": "draft"},
            "_collection": {"source_file": "C:/secret.json"},
        })
        self.assertIn("soft", text)
        self.assertNotIn("default", text)
        self.assertNotIn("genesis", text)
        self.assertNotIn("draft", text)
        self.assertNotIn("secret", text)


if __name__ == "__main__":
    unittest.main()
