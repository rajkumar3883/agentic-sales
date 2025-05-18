import sys

def test_function(inputText):
    return inputText

if __name__ == "__main__":
    input_text = sys.argv[1]  # get argument
    result = test_function(input_text)
    print(result)  # output the result
    sys.exit(0)
