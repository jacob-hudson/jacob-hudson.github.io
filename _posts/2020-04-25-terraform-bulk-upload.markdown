---
layout: post
title:  "Bulk DynamoDB Population with Terraform"
date:   2020-04-026 18:24:27 -0500
categories: terraform aws dynamodb
---
# Overview

DynamoDB is great!  It can be used for routing and metadata table, be used to lock Terraform State files, track states of applicatins and much more!  This post will offer a solution for populating the data within a DynamoDB table at create-rime, entirely within Terraform.  

The issue I am lokking to solve here is to providion a DynamoDB lookup table without from Terraform, without involving extra steps that Terraform can not invoke, without a ton of extra work, and something that can be easily re-produceable and scalable.

The code is available here for thsoe who just wnat to get to the solution:  https://github.com/jacob-hudson/terraform-bulk-upload

# Current Problem

Provisiong an empty DynamoDB table in Terraform is quite easy, an example is below:

{% highlight hcl %}
resource "aws_dynamodb_table" "basic-dynamodb-table" {
  name           = "GameScores"
  billing_mode   = "PROVISIONED"
  read_capacity  = 20
  write_capacity = 20
  hash_key       = "UserId"
  range_key      = "GameTitle"

  attribute {
    name = "UserId"
    type = "S"
  }

  attribute {
    name = "GameTitle"
    type = "S"
  }

  attribute {
    name = "TopScore"
    type = "N"
  }

  ttl {
    attribute_name = "TimeToExist"
    enabled        = false
  }

  global_secondary_index {
    name               = "GameTitleIndex"
    hash_key           = "GameTitle"
    range_key          = "TopScore"
    write_capacity     = 10
    read_capacity      = 10
    projection_type    = "INCLUDE"
    non_key_attributes = ["UserId"]
  }

  tags = {
    Name        = "dynamodb-table-1"
    Environment = "production"
  }
}
{% endhighlight %}

Source:  https://www.terraform.io/docs/providers/aws/r/dynamodb_table.html

This will result in a blank table, that has to be managed later.  Hashicorp does offer a solution for managing DynamoDB Iteams, as shown below:

{% highlight hcl %}
resource "aws_dynamodb_table_item" "example" {
  table_name = "${aws_dynamodb_table.example.name}"
  hash_key   = "${aws_dynamodb_table.example.hash_key}"

  item = <<ITEM
{
  "exampleHashKey": {"S": "something"},
  "one": {"N": "11111"},
  "two": {"N": "22222"},
  "three": {"N": "33333"},
  "four": {"N": "44444"}
}
ITEM
}
{% endhighlight %}

This works quite well, but is limited to one item per resource.  That does not scale well, and produces massive Terraform Configuratinn files.  In fact, the Terraform Documentation itself gives the same warning:

```
Note: This resource is not meant to be used for managing large amounts of data in your table, it is not designed to scale. You should perform regular backups of all data in the table, see AWS docs for more.
```

This is clearly not an optiaml solution, so what can be done?  Let's see what AWS has to offer, since DynamoDB is an AWS Product

# `PutItem` vs `BatchWriteItem`

DynamoDB offers a fwe mthods for writing data to tables, `PutItem` and `BatchWriteItem`.  Some key details of each is below:

## `PutItem`
- Is used to upload a single item
- Can determine if the field exists before uploading

## `BatchWriteItem`
- Can upload many items to a table at once
- Will simply overwite all items that ahve matching Primary Keys

It looks as we have a working solution, as `BatchWriteItem` will load as many items into a table as we like, will be able to do everything at once, and we can centralize data managment of the table.

Now, how can we get this to be invovled solely from Terraform?

# `Local-Exec` Provisoner

A privisioner in Terraform allows for the execution of a file into either the local machine running Terraform for the machine Terraform just provisioned.  In a little known fact for Terraform, `local-exec` will run on any resource, not just EC2!

An example of using local-exec with EC2 is below:
{% highlight hcl %}
resource "aws_instance" "web" {
  # ...

  provisioner "local-exec" {
    command = "echo The server's IP address is ${self.private_ip}"
  }
}
{% endhighlight %}

The example above is for EC2; However, `local-exec` can run for any AWS resource, including DynamoDB!

# Solution
Alright, so we now have the following:
- A Terraform Configuration to Build a DynamoDB Table
- A Method for uploading multiple items to said table
- A Solution for executing the dataload from Terraform

The only thing left now is to put everything together!

In this example,  i ahve rpovisoned a very simple DynamoDB table, with 1 unite of Read and Write cataptiy, no encryption, no streams, and no Autoscaling.  Within the DynamoDB resource, I invoke the `local-exec` provisoner to kick off a Shell script on the same machine that is running Terrafrom (which also has the AWSCLI installed), this will run `BactchWriteItem` for the table I just created and load all of the sample data.

