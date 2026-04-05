#!/bin/bash

# Configuration
JAR_PATH="/home/semih/Dev/cs319/plantuml-gplv2-1.2026.1.jar"
PUML_FILE="class_diagram.puml"
NOTYPES_FILE="class_diagram_notypes.puml"

echo "Generating diagram WITH types..."
java -DPLANTUML_LIMIT_SIZE=16384 -jar "$JAR_PATH" -tpng "$PUML_FILE"
java -DPLANTUML_LIMIT_SIZE=16384 -jar "$JAR_PATH" -tsvg "$PUML_FILE"

# Rename to explicitly say 'with_types'
mv class_diagram.png class_diagram_with_types.png
mv class_diagram.svg class_diagram_with_types.svg

echo "Preparing class_diagram without types..."
python3 -c "
import re
with open('$PUML_FILE', 'r') as f:
    text = f.read()

# 1. Remove return types
text = re.sub(r'\):\s*[a-zA-Z0-9_\[\]\?]+', ')', text)

# 2. Remove parameter and field types (handles optional ? too)
text = re.sub(r'\??:\s*[a-zA-Z0-9_\[\]\?]+', '', text)

with open('$NOTYPES_FILE', 'w') as f:
    f.write(text)
"

echo "Generating diagram WITHOUT types..."
java -DPLANTUML_LIMIT_SIZE=16384 -jar "$JAR_PATH" -tpng "$NOTYPES_FILE"
java -DPLANTUML_LIMIT_SIZE=16384 -jar "$JAR_PATH" -tsvg "$NOTYPES_FILE"

# The plantuml output will be 'class_diagram_notypes.png'. Let's rename it to the default name.
mv class_diagram_notypes.png class_diagram.png
mv class_diagram_notypes.svg class_diagram.svg
rm "$NOTYPES_FILE"

echo "Success! Both versions (with and without types) have been generated."
