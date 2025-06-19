import fs from "fs"
import PDFDocument from "pdfkit"
import csv from "csv-parser"
import path from "path"

class ReportGenerator {
  constructor(csvPath) {
    this.csvPath = csvPath
    this.data = []
    this.d3 = null
  }

  async readCSV() {
    // Check if file exists first
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(`CSV file not found at path: ${this.csvPath}`)
    }

    return new Promise((resolve, reject) => {
      const results = []
      fs.createReadStream(this.csvPath)
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          if (results.length === 0) {
            reject(new Error("CSV file is empty"))
          } else {
            resolve(results)
          }
        })
        .on("error", (error) => reject(error))
    })
  }

  generateOverview(data) {
    try {
      // Get unique departments
      const departments = new Set(data.map((row) => row["Department"])).size

      // Calculate average satisfaction rate
      let satisfactionCount = 0
      let totalSatisfactionResponses = 0

      data.forEach((row) => {
        // Look for satisfaction-related questions
        Object.keys(row).forEach((key) => {
          if (key.startsWith("Answer")) {
            const answer = row[key].toLowerCase()
            if (this.isSatisfactionQuestion(row[`Question ${key.split(" ")[1]}`])) {
              totalSatisfactionResponses++
              if (this.isPositiveSatisfactionResponse(answer)) {
                satisfactionCount++
              }
            }
          }
        })
      })

      const averageSatisfactionRate =
        totalSatisfactionResponses > 0 ? (satisfactionCount / totalSatisfactionResponses) * 100 : 0

      return {
        departments,
        averageSatisfactionRate,
      }
    } catch (error) {
      console.error("Error generating overview:", error)
      return {
        departments: 0,
        averageSatisfactionRate: 0,
      }
    }
  }

  isSatisfactionQuestion(question) {
    if (!question) return false
    const questionLower = question.toLowerCase()
    return questionLower.includes("satisf") || questionLower.includes("happy") || questionLower.includes("content")
  }

  isPositiveSatisfactionResponse(answer) {
    const positiveResponses = ["very satisfied", "satisfied", "very happy", "happy", "excellent", "good"]
    return positiveResponses.some(
      (response) => answer.includes(response) && !answer.includes("not") && !answer.includes("dis"),
    )
  }

  async initialize() {
    try {
      this.d3 = await import("d3-array")
    } catch (error) {
      console.error("Error loading d3-array:", error)
      throw error
    }
  }

  async analyze() {
    try {
      const responses = await this.loadResponses()
      const satisfactionRate = this.calculateSatisfactionRate(responses)

      // Group responses by department
      const departmentResponses = {}
      responses.forEach((response) => {
        const dept = response.department || "Unknown"
        if (!departmentResponses[dept]) {
          departmentResponses[dept] = []
        }
        departmentResponses[dept].push(response)
      })

      // Calculate department-wise stats
      const departmentStats = Object.entries(departmentResponses)
        .map(([dept, deptResponses]) => {
          const deptSatisfactionRate = this.calculateSatisfactionRate(deptResponses)
          return `${dept}: ${deptSatisfactionRate}% Satisfaction`
        })
        .join("\n")

      return {
        satisfactionRate,
        departmentStats,
        departmentResponses,
      }
    } catch (error) {
      console.error("Analysis error:", error)
      throw error
    }
  }

  // Update the generateAnalysis method
  async generateAnalysis() {
    try {
      const responses = await this.readCSV()
      const departments = [...new Set(responses.map((r) => r["Department"]))]

      // Calculate overall satisfaction metrics across all responses
      const overallMetrics = this.calculateSatisfactionPercentage(responses)

      // Process department-wise statistics and find department with highest dissatisfaction
      let highestDissatisfactionDept = ""
      let highestDissatisfactionRate = 0

      departments.forEach((dept) => {
        const deptResponses = responses.filter((r) => r["Department"] === dept)
        const deptMetrics = this.calculateSatisfactionPercentage(deptResponses)

        if (deptMetrics.dissatisfaction > highestDissatisfactionRate) {
          highestDissatisfactionRate = deptMetrics.dissatisfaction
          highestDissatisfactionDept = dept
        }
      })

      const analysis = {
        overview: {
          numberOfDepartments: departments.length,
          averageSatisfaction: `${overallMetrics.satisfaction}%`,
          averageDissatisfaction: `${overallMetrics.dissatisfaction}%`,
          departmentWithHighestDissatisfaction: highestDissatisfactionDept ? `${highestDissatisfactionDept}` : "None",
          highestDissatisfactionRate: highestDissatisfactionRate,
        },
        departmentStats: {},
      }

      // Process department-wise statistics
      departments.forEach((dept) => {
        const deptResponses = responses.filter((r) => r["Department"] === dept)

        // Analyze questions for this department
        const questionAnalysis = {}
        deptResponses.forEach((response) => {
          Object.keys(response).forEach((key) => {
            if (key.startsWith("Question")) {
              const qNum = key.split(" ")[1]
              const answerKey = `Answer ${qNum}`
              const question = response[key]
              const answer = response[answerKey]

              if (!questionAnalysis[qNum]) {
                // Collect all answers for this question to better determine type
                const allAnswersForQuestion = deptResponses
                  .map((r) => r[answerKey])
                  .filter((a) => a && a !== "No answer")

                questionAnalysis[qNum] = {
                  question: question,
                  responses: {},
                  responseCount: 0,
                  type: this.determineQuestionType(answer, allAnswersForQuestion),
                }
              }

              if (!answer || answer === "No answer") return

              // Handle different types of questions
              if (questionAnalysis[qNum].type === "StarRating") {
                // For star ratings, normalize the answer
                const starValue = answer.toString().trim()
                if (/^[1-5]$/.test(starValue)) {
                  questionAnalysis[qNum].responses[starValue] = (questionAnalysis[qNum].responses[starValue] || 0) + 1
                }
              } else if (questionAnalysis[qNum].type === "Checkbox") {
                // Handle checkbox questions
                const options = answer.split(",").map((opt) => opt.trim())
                options.forEach((opt) => {
                  questionAnalysis[qNum].responses[opt] = (questionAnalysis[qNum].responses[opt] || 0) + 1
                })
              } else {
                // Handle MCQ and text questions
                questionAnalysis[qNum].responses[answer] = (questionAnalysis[qNum].responses[answer] || 0) + 1
              }
              questionAnalysis[qNum].responseCount++
            }
          })
        })

        analysis.departmentStats[dept] = {
          questionAnalysis: questionAnalysis,
        }
      })

      return analysis
    } catch (error) {
      console.error("Analysis generation error:", error)
      throw error
    }
  }

  isMCQQuestion(answers) {
    const commonOptions = ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
    return answers.every((answer) => commonOptions.includes(answer) || answer === "No answer")
  }

  isCheckboxQuestion(answers) {
    return answers.some((answer) => answer.includes(","))
  }

  // Add this new method to identify star rating questions
  isStarRatingQuestion(question, answers) {
    if (!question || !answers) return false

    // Check if answers match the star rating pattern
    const starPattern = /^\d+\s*stars?$/i
    const hasStarFormat = answers.some((answer) => answer && starPattern.test(answer.trim()))

    return hasStarFormat
  }

  // Replace the existing calculateAverageStarRating method
  calculateAverageStarRating(responses) {
    const validResponses = responses.filter((response) => {
      if (!response || typeof response !== "string") return false
      const numberMatch = response.match(/(\d+)\s*stars?/i)
      return numberMatch !== null
    })

    if (validResponses.length === 0) return "0.0"

    const sum = validResponses.reduce((total, response) => {
      const numberMatch = response.match(/(\d+)\s*stars?/i)
      const stars = Number.parseInt(numberMatch[1])
      return isNaN(stars) ? total : total + stars
    }, 0)

    return (sum / validResponses.length).toFixed(1)
  }

  // Updated generatePDF method with visualizations removed
  async generatePDF(analysis) {
    try {
      // Validate analysis object
      if (!analysis) {
        analysis = await this.generateAnalysis()
      }

      // Set default values
      const defaultAnalysis = {
        overview: {
          departments: 0,
          averageSatisfactionRate: 0,
        },
        departmentStats: {},
        questionAnalysis: {},
      }

      // Merge with defaults
      analysis = {
        ...defaultAnalysis,
        ...analysis,
        overview: {
          ...defaultAnalysis.overview,
          ...(analysis?.overview || {}),
        },
      }

      const doc = new PDFDocument({
        autoFirstPage: true,
        size: "A4",
        margin: 50,
        info: {
          Title: "Survey Analysis Report",
          Author: "Survey Analysis System",
          Subject: "Survey Results and Analysis",
          Keywords: "survey, analysis, satisfaction, departments",
        },
      })

      const outputPath = path.join(path.dirname(this.csvPath), "..", "reports", "survey_analysis.pdf")

      // Ensure reports directory exists
      const reportsDir = path.dirname(outputPath)
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
      }

      const stream = fs.createWriteStream(outputPath)
      doc.pipe(stream)

      // Cover page
      doc.fontSize(28).text("Survey Analysis Report", { align: "center" })
      doc.moveDown()
      doc.fontSize(14).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: "center" })
      doc.moveDown(2)

      // Add a simple border
      doc
        .lineWidth(2)
        .rect(50, 50, doc.page.width - 100, doc.page.height - 100)
        .stroke()

      doc.addPage()

      // Table of contents
      doc.fontSize(20).text("Table of Contents", { align: "center" })
      doc.moveDown()
      doc
        .fontSize(12)
        .text("1. Executive Summary", { link: "executive-summary" })
        .text("2. Department Analysis", { link: "department-analysis" })
        .text("3. Question Analysis", { link: "question-analysis" })

      doc.addPage()

      // Executive Summary
      doc.addNamedDestination("executive-summary")
      doc.fontSize(20).text("1. Executive Summary", { align: "center" })
      doc.moveDown()

      // Overview section
      doc.fontSize(16).text("Overview")
      doc
        .fontSize(12)
        .text(`Number of Departments: ${analysis.overview.numberOfDepartments}`)
        .text(`Overall Satisfaction: ${analysis.overview.averageSatisfaction}`)
        .text(`Overall Dissatisfaction: ${analysis.overview.averageDissatisfaction}`)
        .text(`Department with Highest Dissatisfaction: ${analysis.overview.departmentWithHighestDissatisfaction}`)
      doc.moveDown(2)

      // Key findings
      doc.fontSize(16).text("Key Findings")
      doc.fontSize(12)

      // Generate some key findings based on the data
      const departments = Object.keys(analysis.departmentStats)
      if (departments.length > 0) {
        doc.text(`• Overall satisfaction across departments is ${analysis.overview.averageSatisfaction}.`)
        doc.text(`• ${analysis.overview.departmentWithHighestDissatisfaction} department shows areas for improvement.`)
      }

      doc.moveDown(2)

      // Department Analysis
      doc.addPage()
      doc.addNamedDestination("department-analysis")
      doc.fontSize(20).text("2. Department Analysis", { align: "center" })
      doc.moveDown()

      // Department Statistics section
      Object.entries(analysis.departmentStats).forEach(([department, stats]) => {
        doc.fontSize(16).text(`Department: ${department}`)

        // Calculate department satisfaction
        let satisfactionScore = 0
        let totalQuestions = 0

        Object.values(stats.questionAnalysis).forEach((qData) => {
          if (qData.type === "MCQ") {
            let questionSatisfaction = 0
            let questionResponses = 0

            const weights = {
              "Very Satisfied": 100,
              Satisfied: 75,
              Neutral: 50,
              Dissatisfied: 25,
              "Very Dissatisfied": 0,
            }

            Object.entries(qData.responses).forEach(([response, count]) => {
              if (weights[response] !== undefined) {
                questionSatisfaction += weights[response] * count
                questionResponses += count
              }
            })

            if (questionResponses > 0) {
              satisfactionScore += questionSatisfaction / questionResponses
              totalQuestions++
            }
          }
        })

        const avgSatisfaction = totalQuestions > 0 ? (satisfactionScore / totalQuestions).toFixed(1) + "%" : "N/A"

        doc.fontSize(12).text(`Department Satisfaction: ${avgSatisfaction}`)
        doc.moveDown()

        doc.text("----------------------------------------")
        doc.moveDown()
      })

      // Question Analysis - Updated format
      doc.addPage()
      doc.addNamedDestination("question-analysis")
      doc.fontSize(20).text("3. Question Analysis", { align: "center" })
      doc.moveDown()

      // Collect and aggregate all questions across all departments
      const questionMap = new Map()

      Object.entries(analysis.departmentStats).forEach(([dept, deptData]) => {
        Object.entries(deptData.questionAnalysis).forEach(([qNum, qData]) => {
          const questionKey = qData.question

          if (!questionMap.has(questionKey)) {
            questionMap.set(questionKey, {
              question: qData.question,
              type: qData.type,
              departmentResponses: new Map(),
            })
          }

          const questionInfo = questionMap.get(questionKey)
          questionInfo.departmentResponses.set(dept, qData)
        })
      })

      // Display analysis for all questions in the new format
      let questionIndex = 1
      questionMap.forEach((questionInfo) => {
        doc.fontSize(14).text(`Question: ${questionInfo.question}`)
        doc.moveDown(0.5)

        // Show department-wise option counts for MCQ, Checkbox, and Star Rating
        if (questionInfo.type === "MCQ" || questionInfo.type === "Checkbox" || questionInfo.type === "StarRating") {
          questionInfo.departmentResponses.forEach((qData, dept) => {
            doc.fontSize(12).text(`${dept} Department:`)

            if (questionInfo.type === "StarRating") {
              // For star ratings, show options 1-5 with their counts
              for (let stars = 1; stars <= 5; stars++) {
                const count = qData.responses[stars.toString()] || 0
                doc.text(`  Option ${stars}: ${count}`)
              }
            } else if (questionInfo.type === "MCQ") {
              // For MCQ, show all options with their counts
              const mcqOrder = ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
              mcqOrder.forEach((option) => {
                const count = qData.responses[option] || 0
                doc.text(`  ${option}: ${count}`)
              })

              // Show any other responses not in the standard MCQ options
              Object.entries(qData.responses).forEach(([option, count]) => {
                if (!mcqOrder.includes(option)) {
                  doc.text(`  ${option}: ${count}`)
                }
              })
            } else {
              // For Checkbox, show all options with their counts
              Object.entries(qData.responses)
                .sort(([, a], [, b]) => b - a) // Sort by count descending
                .forEach(([option, count]) => {
                  doc.text(`  ${option}: ${count}`)
                })
            }
            doc.moveDown(0.3)
          })
        } else if (questionInfo.type === "Text") {
          // For text questions, simply show the responses
          questionInfo.departmentResponses.forEach((qData, dept) => {
            doc.fontSize(12).text(`${dept} Department:`)
            const responses = Object.keys(qData.responses).slice(0, 3) // Limit to 3 responses per department
            responses.forEach((response) => {
              if (response && response !== "No answer") {
                doc.text(`  "${response}"`)
              }
            })
            if (Object.keys(qData.responses).length > 3) {
              doc.text(`  ... and ${Object.keys(qData.responses).length - 3} more`)
            }
            doc.moveDown(0.3)
          })
        }

        doc.moveDown(1)
        questionIndex++

        // Add page break if needed (check if we're near bottom of page)
        if (doc.y > 700) {
          doc.addPage()
        }
      })

      doc.end()

      return new Promise((resolve, reject) => {
        stream.on("finish", () => resolve(outputPath))
        stream.on("error", reject)
      })
    } catch (error) {
      console.error("PDF Generation Error:", error)
      throw new Error(`Failed to generate PDF: ${error.message}`)
    }
  }

  calculateSatisfactionRate(responses) {
    let totalResponses = 0
    let satisfiedCount = 0

    responses.forEach((response) => {
      Object.values(response.answers).forEach((answer) => {
        if (typeof answer === "string") {
          const lowerAnswer = answer.toLowerCase()
          // Check for satisfaction-related responses
          if (lowerAnswer.includes("satisf") || lowerAnswer.includes("happy") || lowerAnswer.includes("good")) {
            totalResponses++

            // Count as satisfied only if positive response
            if (
              !lowerAnswer.includes("not") &&
              !lowerAnswer.includes("dis") &&
              (lowerAnswer.includes("very satisf") ||
                lowerAnswer.includes("quite satisf") ||
                lowerAnswer.includes("very happy") ||
                lowerAnswer.includes("very good"))
            ) {
              satisfiedCount++
            }
          }
        }
      })
    })

    return totalResponses > 0 ? Math.round((satisfiedCount / totalResponses) * 100) : 0
  }

  calculateOverallSatisfactionRate() {
    return this.calculateSatisfactionRate(this.data)
  }

  analyzeQuestions() {
    if (!this.d3) return {}

    const questions = {}
    this.data.forEach((response) => {
      for (const [key, value] of Object.entries(response)) {
        if (key.startsWith("Question")) {
          if (!questions[key]) {
            questions[key] = {
              text: value,
              responses: [],
            }
          }
          const answerKey = `Answer ${key.split(" ")[1]}`
          questions[key].responses.push(response[answerKey])
        }
      }
    })

    return questions
  }

  async loadResponses() {
    return new Promise((resolve, reject) => {
      const responses = []
      fs.createReadStream(this.csvPath)
        .pipe(csv())
        .on("data", (data) => {
          // Transform CSV data into response format
          const response = {
            department: data.Department,
            answers: {},
          }

          // Extract questions and answers
          Object.keys(data).forEach((key) => {
            if (key.startsWith("Question")) {
              const questionNumber = key.split(" ")[1]
              const answerKey = `Answer ${questionNumber}`
              response.answers[`q${questionNumber}`] = data[answerKey]
            }
          })

          responses.push(response)
        })
        .on("end", () => {
          this.data = responses // Store the data for other methods to use
          resolve(responses)
        })
        .on("error", (error) => {
          reject(error)
        })
    })
  }

  calculateSatisfactionPercentage(responses) {
    let satisfactionScore = 0
    let dissatisfactionScore = 0
    let satisfactionQuestions = 0
    let dissatisfactionQuestions = 0

    responses.forEach((response) => {
      Object.keys(response).forEach((key) => {
        if (key.startsWith("Answer")) {
          const answer = response[key]
          const questionKey = `Question ${key.split(" ")[1]}`
          const question = response[questionKey]

          if (!answer || !question) return

          // Handle star ratings
          const starMatch = answer.match(/(\d+)\s*stars?/i)
          if (starMatch) {
            const stars = Number.parseInt(starMatch[1])
            if (!isNaN(stars)) {
              if (stars >= 3) {
                satisfactionScore += (stars / 5) * 100
                satisfactionQuestions++
              } else {
                dissatisfactionScore += ((5 - stars) / 5) * 100
                dissatisfactionQuestions++
              }
            }
          }
          // Handle satisfaction-based responses
          else {
            const satisfactionLevels = {
              "Very Satisfied": 100,
              Satisfied: 75,
              Neutral: 50,
              Dissatisfied: 25,
              "Very Dissatisfied": 0,
            }

            const answerKey = answer.trim()
            if (satisfactionLevels.hasOwnProperty(answerKey)) {
              if (["Very Satisfied", "Satisfied"].includes(answerKey)) {
                satisfactionScore += satisfactionLevels[answerKey]
                satisfactionQuestions++
              } else if (["Dissatisfied", "Very Dissatisfied"].includes(answerKey)) {
                dissatisfactionScore += 100 - satisfactionLevels[answerKey]
                dissatisfactionQuestions++
              }
            }
          }
        }
      })
    })

    return {
      satisfaction: satisfactionQuestions > 0 ? Math.round(satisfactionScore / satisfactionQuestions) : 0,
      dissatisfaction: dissatisfactionQuestions > 0 ? Math.round(dissatisfactionScore / dissatisfactionQuestions) : 0,
    }
  }

  // Add this helper method - improved question type detection
  determineQuestionType(answer, allAnswers = []) {
    // Check if it's a star rating (numbers 1-5)
    if (answer && /^[1-5]$/.test(answer.toString().trim())) {
      return "StarRating"
    }

    // Check if answer contains "stars"
    if (answer && answer.match(/(\d+)\s*stars?/i)) {
      return "StarRating"
    }

    // Check if it's a checkbox (contains comma)
    if (answer && answer.includes(",")) {
      return "Checkbox"
    }

    // Check if it's MCQ (satisfaction levels)
    const mcqOptions = ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"]
    if (answer && mcqOptions.includes(answer.trim())) {
      return "MCQ"
    }

    // Default to text
    return "Text"
  }
}

export default ReportGenerator
